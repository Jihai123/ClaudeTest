"""Offline crawler regression: no network, subprocess or production data."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]

class CrawlerDefaults(unittest.TestCase):
    def test_dry_run_filters_without_downloads_or_log_writes(self):
        spec = importlib.util.spec_from_file_location("batch", ROOT / "server/crawlers/batch_crawl.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(module.DEFAULT_DRIVER, "api")
        self.assertEqual(module.DEFAULT_MAX_NUMBER, 15)
        with tempfile.TemporaryDirectory() as directory:
            cities = Path(directory) / "cities.json"
            cities.write_text(json.dumps({"cities":[
                {"id":1,"name":"fixture","province":"test","list_type":"china_layflat","image_count":0},
                {"id":2,"name":"excluded","province":"test","list_type":"china_general","image_count":5}]}))
            output = io.StringIO()
            with patch.object(module, "CITIES_FILE", cities), patch.object(module, "LOG_FILE", Path(directory)/"log.json"), patch.object(module, "crawl_city_images") as crawl, patch.object(module, "save_crawl_log") as save, patch("sys.argv", ["batch","--dry-run","--no-images","--list-type","china_layflat"]), contextlib.redirect_stdout(output):
                module.main()
            crawl.assert_not_called()
            save.assert_not_called()
            self.assertIn("fixture", output.getvalue())
            self.assertNotIn("excluded", output.getvalue())
            self.assertEqual(list(Path(directory).iterdir()), [cities])

    def test_cli_overrides_production_defaults(self):
        spec = importlib.util.spec_from_file_location("batch", ROOT / "server/crawlers/batch_crawl.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with patch.object(module, "batch_crawl") as run, patch("sys.argv", ["batch","--driver","chrome_headless","--max-number","2"]):
            module.main()
        args = run.call_args[0][0]
        self.assertEqual((args.driver, args.max_number), ("chrome_headless", 2))
