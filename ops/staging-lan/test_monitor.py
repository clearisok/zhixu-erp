import datetime
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('monitor', Path(__file__).with_name('monitor.py'))
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)
NOW = datetime.datetime(2026, 11, 21, tzinfo=datetime.timezone.utc)


class MonitorTests(unittest.TestCase):
    def healthy(self):
        return {name: {'at': NOW.isoformat(), 'state': 'healthy'} for name in ['check', 'renew']}

    def test_healthy(self):
        self.assertEqual(monitor.evaluate(NOW, self.healthy(), 89, True), [])

    def test_later_health_does_not_hide_renew_failure(self):
        states = self.healthy()
        states['renew']['state'] = 'failed'
        self.assertIn('renew_failed', monitor.evaluate(NOW, states, 89, True))

    def test_stale_cron_and_expiry_are_alerts(self):
        states = self.healthy()
        states['check']['at'] = (NOW - datetime.timedelta(hours=3)).isoformat()
        self.assertEqual(monitor.evaluate(NOW, states, 20, True), ['check_stale', 'certificate_under_21_days'])

    def test_missing_renew_and_permissions(self):
        self.assertEqual(monitor.evaluate(NOW, {}, 89, False), ['check_missing', 'renew_missing', 'private_permissions'])

    def test_corrupt_state_and_future_timestamp_are_alerts(self):
        states = self.healthy()
        states['check'] = 'corrupt'
        states['renew']['at'] = (NOW + datetime.timedelta(hours=1)).isoformat()
        self.assertEqual(monitor.evaluate(NOW, states, 89, True), ['check_invalid', 'renew_stale'])

    def test_origin_expiry_is_not_hidden_by_new_public_certificate(self):
        self.assertEqual(monitor.evaluate(NOW, self.healthy(), 89, True, 20), ['origin_certificate_under_21_days_or_unavailable'])


if __name__ == '__main__':
    unittest.main()
