#!/usr/bin/env python3
"""Fail-closed GitHub issue-comment bridge to Yiju's existing Agent API.

Only public source-backed city evidence is allowed in issue comments. The
bearer credential stays exclusively in GitHub Actions Secrets.
"""
import argparse
import datetime as dt
import http.client
import json
import os
from pathlib import Path
import re
import ssl
import sys
from urllib.parse import quote, urlsplit

PREFIX = "YIJU_AGENT_REQUEST_V1"
OWNER = "Jihai123"
ISSUE_NUMBER = 138
HOST = "yiju.zhibeimao.com"
BASE = "/api/agent/city-data"
AUTO_FIELDS = {"slogan", "location_intro", "key_points", "notes"}
SOURCE_TYPES = {"government", "research", "housing_market", "media", "community", "other"}
PROPOSAL_SOURCES = {"government", "research", "housing_market"}
PAYLOAD_FIELDS = {
    "external_id", "city_id", "scope_name", "source_url", "source_date",
    "source_note", "source_type", "source_access", "source_excerpt",
    "observation_period", "metric_key", "metric_value", "metric_unit", "proposal"
}
REQUIRED_FIELDS = {
    "external_id", "city_id", "scope_name", "source_url", "source_date",
    "source_note", "source_type", "source_access", "metric_key", "metric_value", "metric_unit"
}


class BridgeError(Exception):
    """Public-safe error code: never store tokens or raw API errors."""


def fail(code):
    raise BridgeError(code)


def require_text(value, min_chars=1, max_chars=1000):
    return isinstance(value, str) and min_chars <= len(value.strip()) <= max_chars


def parse_event(event):
    """Recheck authorization in Python, not only in the workflow expression."""
    if not isinstance(event, dict) or event.get("action") != "created":
        fail("wrong_event")
    issue = event.get("issue") or {}
    comment = event.get("comment") or {}
    if issue.get("number") != ISSUE_NUMBER or issue.get("state") != "open":
        fail("wrong_issue")
    if (comment.get("user") or {}).get("login") != OWNER:
        fail("unauthorized_commenter")
    comment_id = comment.get("id")
    if not isinstance(comment_id, int) or isinstance(comment_id, bool) or comment_id < 1:
        fail("invalid_comment_id")
    raw = comment.get("body")
    if not isinstance(raw, str) or not raw.startswith(PREFIX + "\n"):
        fail("bad_prefix")
    body = raw[len(PREFIX) + 1:].strip()
    if len(body.encode("utf-8")) > 7500:
        fail("request_too_large")
    try:
        message = json.loads(body)
    except (TypeError, ValueError):
        fail("invalid_json")
    if not isinstance(message, dict) or set(message) - {"mode", "payload"}:
        fail("invalid_envelope")
    if message.get("mode") == "probe":
        if set(message) != {"mode"}:
            fail("probe_must_have_no_payload")
    elif message.get("mode") == "submit":
        if set(message) != {"mode", "payload"}:
            fail("submit_missing_payload")
        validate_payload(message["payload"])
    else:
        fail("unsupported_mode")
    return comment_id, message


def validate_payload(data):
    if not isinstance(data, dict) or set(data) - PAYLOAD_FIELDS or REQUIRED_FIELDS - set(data):
        fail("invalid_payload_fields")
    ext_id = data["external_id"]
    if not isinstance(ext_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{7,119}", ext_id):
        fail("invalid_external_id")
    city_id = data["city_id"]
    if not isinstance(city_id, int) or isinstance(city_id, bool) or city_id < 1:
        fail("invalid_city_id")
    if not require_text(data["scope_name"], 2, 100) or not require_text(data["source_note"], 10, 1000):
        fail("invalid_source_scope")
    url = data["source_url"]
    if not isinstance(url, str) or len(url) > 2048:
        fail("invalid_source_url")
    try:
        parts = urlsplit(url)
        if (parts.scheme != "https" or not parts.hostname or
                parts.username is not None or parts.password is not None or
                parts.port not in (None, 443)):
            fail("invalid_source_url")
    except ValueError:
        fail("invalid_source_url")
    try:
        source_date = dt.date.fromisoformat(data["source_date"])
        if data["source_date"] != source_date.isoformat():
            fail("invalid_source_date")
        china_today = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
        if source_date > china_today:
            fail("future_source_date")
    except (TypeError, ValueError):
        fail("invalid_source_date")
    if data["source_type"] not in SOURCE_TYPES or data["source_access"] not in {"fetched", "search_only"}:
        fail("invalid_source_type_or_access")
    excerpt = data.get("source_excerpt")
    if data["source_access"] == "fetched" and not require_text(excerpt, 15, 800):
        fail("missing_fetched_excerpt")
    if excerpt is not None and not require_text(excerpt, 15, 800):
        fail("invalid_excerpt")
    metric = data["metric_key"]
    if not isinstance(metric, str) or not re.fullmatch(r"[a-z][a-z0-9_]{1,79}", metric):
        fail("invalid_metric_key")
    value = data["metric_value"]
    if not (value is None or (isinstance(value, (int, float)) and not isinstance(value, bool)
                             and abs(value) != float("inf") and value == value)
            or (isinstance(value, str) and len(value) <= 300)):
        fail("invalid_metric_value")
    if not require_text(data["metric_unit"], 1, 30):
        fail("invalid_metric_unit")
    if "observation_period" in data and data["observation_period"] is not None:
        if not require_text(data["observation_period"], 4, 40):
            fail("invalid_observation_period")
    proposal = data.get("proposal")
    if proposal is not None:
        if data["source_access"] != "fetched" or data["source_type"] not in PROPOSAL_SOURCES:
            fail("proposal_requires_eligible_fetched_source")
        if not isinstance(proposal, dict) or set(proposal) - {
            "field", "new_value", "expected_old_value", "conversion_note", "auto_apply"
        } or not {"field", "new_value", "expected_old_value", "conversion_note"} <= set(proposal):
            fail("invalid_proposal")
        if not require_text(proposal["field"], 2, 80):
            fail("invalid_proposal_field")
        if not require_text(proposal["conversion_note"], 10, 300):
            fail("invalid_conversion_note")
        if "auto_apply" in proposal and not isinstance(proposal["auto_apply"], bool):
            fail("invalid_auto_apply")
        if proposal.get("auto_apply") is True and proposal["field"] not in AUTO_FIELDS:
            fail("auto_apply_field_forbidden")
    if len(json.dumps(data, ensure_ascii=False, separators=(",", ":"))) > 6000:
        fail("api_payload_too_large")


def api_request(method, path, token, payload=None):
    """Pinned HTTPS host; no redirects, arbitrary routes, or response-body logs."""
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,256}", token):
        fail("invalid_secret_format")
    headers = {
        "Authorization": "Bearer " + token,
        "Accept": "application/json",
        "User-Agent": "YijuGitHubBridge/1.0",
    }
    body = None
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"
    connection = http.client.HTTPSConnection(HOST, timeout=18, context=ssl.create_default_context())
    try:
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        raw = response.read(16385)
        if len(raw) > 16384:
            fail("api_response_too_large")
        if response.status not in (200, 201):
            fail("api_http_" + str(response.status))
        try:
            result = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeError):
            fail("invalid_api_json")
        if not isinstance(result, dict):
            fail("invalid_api_result")
        return result
    finally:
        connection.close()


def execute(event, token, sender=api_request):
    comment_id, message = parse_event(event)
    if message["mode"] == "probe":
        return {"status": "probe_ok", "comment_id": comment_id, "mode": "probe"}
    payload = message["payload"]
    if not token:
        fail("missing_actions_secret")
    submitted = sender("POST", BASE + "/submissions", token, payload)
    if submitted.get("external_id") != payload["external_id"] or submitted.get("city_id") != payload["city_id"]:
        fail("post_response_mismatch")
    external_id = payload["external_id"]
    reviewed = sender("GET", BASE + "/submissions/" + quote(external_id, safe=""), token)
    if (reviewed.get("external_id") != external_id or
            reviewed.get("city_id") != payload["city_id"] or
            not isinstance(reviewed.get("evidence_id"), int)):
        fail("status_readback_mismatch")
    # Server resultRow() uses review_status/submission_status, not change_status.
    # Do not mistake an accepted proposal for an applied field change.
    change_id = reviewed.get("change_request_id")
    review_status = reviewed.get("review_status")
    submission_status = reviewed.get("submission_status")
    if change_id is None:
        if submission_status != "evidence_only" or review_status is not None:
            fail("missing_evidence_only_status")
    else:
        if (not isinstance(change_id, int) or isinstance(change_id, bool) or
                change_id < 1 or review_status not in {
                "pending", "approved", "rejected", "rolled_back"
                } or submission_status not in {
                "approved", "pending_manual_review", "reviewed"
                }):
            fail("missing_review_status")
    return {
        "status": "submitted_readback_ok",
        "comment_id": comment_id, "mode": "submit",
        "external_id": external_id, "city_id": payload["city_id"],
        "evidence_id": reviewed["evidence_id"],
        "change_request_id": change_id,
        "change_status": review_status,
        "submission_status": submission_status,
        "replayed": bool(submitted.get("replayed")),
    }


def receipt_message(result):
    """Only allowlisted status fields go to the public queue issue."""
    status = str(result.get("status", "unknown"))[:80]
    comment_id = result.get("comment_id")
    lines = ["### 易居 API 桥接回执", "- 状态：" + status]
    if isinstance(comment_id, int):
        lines.append("- 原始请求：https://github.com/Jihai123/ClaudeTest/issues/138#issuecomment-" + str(comment_id))
    for key, label in [
        ("external_id", "外部请求ID"), ("city_id", "城市ID"),
        ("evidence_id", "证据ID"), ("change_request_id", "变更申请ID"),
        ("change_status", "审核状态"), ("submission_status", "提交状态"), ("replayed", "幂等重放")
    ]:
        val = result.get(key)
        if val is not None and type(val) in (str, int, bool):
            lines.append("- " + label + "：" + json.dumps(val, ensure_ascii=False))
    if result.get("reason_code"):
        lines.append("- 诊断代码：" + str(result["reason_code"])[:80])
    lines.append("仅代表桥接实际响应；自动变更仅当后端报告批准才算生效。")
    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--event-file")
    p.add_argument("--result-file", required=True)
    p.add_argument("--receipt", action="store_true")
    args = p.parse_args()
    result_path = Path(args.result_file)
    if args.receipt:
        result = json.loads(result_path.read_text(encoding="utf-8"))
        receipt_path = result_path.with_suffix(".comment.json")
        receipt_path.write_text(
            json.dumps({"body": receipt_message(result)}, ensure_ascii=False), encoding="utf-8"
        )
        print(str(receipt_path))
        return 0
    result = {"status": "failed", "reason_code": "unknown"}
    try:
        if not args.event_file:
            fail("missing_github_event")
        event = json.loads(Path(args.event_file).read_text(encoding="utf-8"))
        result = execute(event, os.environ.get("YIJU_AGENT_API_TOKEN", ""))
    except BridgeError as exc:
        result = {"status": "blocked", "reason_code": str(exc)}
    except (OSError, TimeoutError, http.client.HTTPException):
        # A POST may have reached the server. Retry only with the SAME
        # external_id after separate status readback; never invent a new ID.
        result = {"status": "unknown_delivery", "reason_code": "network_or_timeout"}
    except (ValueError, TypeError, KeyError):
        result = {"status": "blocked", "reason_code": "invalid_event_or_data"}
    result_path.write_text(json.dumps(result, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    print("YIJU_BRIDGE_STATUS=" + result["status"])
    return 0 if result["status"] in ("probe_ok", "submitted_readback_ok") else 1


if __name__ == "__main__":
    sys.exit(main())
