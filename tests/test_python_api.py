import unittest
from unittest.mock import Mock, patch

from api import analytics, catalog


class AnalyticsAggregationTests(unittest.TestCase):
    def test_build_analytics_aggregates_public_profiles_and_recent_sample(self):
        profiles = [
            {
                "handle": "army-one",
                "display_name": "Army One",
                "country_code": "MX",
                "total_streams": 12,
                "today_streams": 3,
                "unique_tracks": 2,
                "last_played_at": "2026-11-04T12:00:00Z",
                "recent_events": [
                    {"track": "Dynamite", "artist": "BTS", "played_at": "2026-11-04T12:00:00Z"},
                    {"track": "Butter", "artist": "BTS", "played_at": "2026-11-04T11:00:00Z"},
                ],
            },
            {
                "handle": "army-two",
                "display_name": "Army Two",
                "country_code": "MX",
                "total_streams": 8,
                "today_streams": 1,
                "unique_tracks": 1,
                "last_played_at": "2026-11-04T10:00:00Z",
                "recent_events": [
                    {"track": "Dynamite", "artist": "BTS", "played_at": "2026-11-04T10:00:00Z"},
                ],
            },
        ]

        result = analytics.build_analytics(profiles)

        self.assertEqual(result["summary"]["public_profiles"], 2)
        self.assertEqual(result["summary"]["public_profile_streams"], 20)
        self.assertEqual(result["summary"]["public_profile_streams_today_utc"], 4)
        self.assertEqual(result["summary"]["countries_represented"], 1)
        self.assertEqual(result["top_countries"][0]["country_code"], "MX")
        self.assertEqual(result["recent_tracks_sample"][0]["track"], "Dynamite")
        self.assertEqual(result["recent_tracks_sample"][0]["recent_plays_sampled"], 2)
        self.assertIn("no es un ranking histórico completo", result["methodology"]["track_chart"])

    def test_build_analytics_ignores_empty_profiles_and_blank_track_names(self):
        result = analytics.build_analytics([
            None,
            {"handle": "empty", "total_streams": 0, "recent_events": [
                {"track": " ", "artist": "BTS", "played_at": None}
            ]},
        ])
        self.assertEqual(result["summary"]["public_profiles"], 1)
        self.assertEqual(result["recent_tracks_sample"], [])


class CatalogAggregationTests(unittest.TestCase):
    @patch("api.catalog.requests.get")
    def test_catalog_separates_confirmed_and_candidate_albums(self, get):
        response = Mock()
        response.ok = True
        response.json.return_value = {
            "rows": [
                {
                    "track_name": "Song A", "musicat_track_id": "a", "total_streams": 7,
                    "match_status": "matched", "album_name": "Album One",
                    "album_uri": "spotify:album:one", "album_type": "album",
                },
                {
                    "track_name": "Song B", "musicat_track_id": "b", "total_streams": 5,
                    "match_status": "matched", "album_name": "Album One",
                    "album_uri": "spotify:album:one", "album_type": "album",
                },
                {
                    "track_name": "Song C", "total_streams": 3, "match_status": "ambiguous",
                    "spotify_candidates": [{
                        "album_name": "Possible Album", "album_uri": "spotify:album:possible",
                        "album_type": "album",
                    }],
                },
            ],
        }
        get.return_value = response

        result = catalog.load_catalog()
        summary = result["python_analytics"]["summary"]

        self.assertEqual(summary["total_streams"], 15)
        self.assertEqual(summary["confirmed_albums"], 1)
        self.assertEqual(summary["candidate_albums"], 1)
        confirmed = result["python_analytics"]["top_albums"][0]
        self.assertEqual(confirmed["album_name"], "Album One")
        self.assertEqual(confirmed["total_streams"], 12)
        self.assertEqual(confirmed["track_count"], 2)
        candidate = result["python_analytics"]["candidate_albums"][0]
        self.assertEqual(candidate["album_name"], "Possible Album")
        self.assertNotIn("total_streams", candidate)

    @patch("api.catalog.requests.get")
    def test_catalog_rejects_unexpected_payload(self, get):
        response = Mock()
        response.ok = True
        response.json.return_value = {"unexpected": []}
        get.return_value = response
        with self.assertRaises(RuntimeError):
            catalog.load_catalog()


if __name__ == "__main__":
    unittest.main()
