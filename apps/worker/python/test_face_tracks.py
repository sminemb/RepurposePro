import unittest
from face_tracks import Tracker, display_dimensions

def face(x, y=.3, width=.12):
    return {"x": x, "y": y, "width": width, "height": .18, "confidence": .9}

class TrackingTests(unittest.TestCase):
    def test_follows_motion_without_changing_identity(self):
        tracker = Tracker()
        for i in range(15):
            tracker.add(i / 5, [face(.1 + i * .015), face(.8)])
        self.assertEqual(len(tracker.tracks), 2)
        self.assertEqual(len(tracker.tracks[0]["samples"]), 15)
        self.assertGreater(tracker.result()[0]["samples"][-1]["x"], .25)

    def test_ambiguous_crossing_holds_instead_of_switching(self):
        tracker = Tracker()
        tracker.add(0, [face(.4), face(.6)])
        tracker.add(.2, [face(.49), face(.51)])
        self.assertEqual(len(tracker.tracks[0]["samples"]), 1)
        self.assertEqual(len(tracker.tracks[1]["samples"]), 1)

    def test_reacquires_short_gap_but_not_unrelated_later_face(self):
        tracker = Tracker()
        tracker.add(0, [face(.3)])
        tracker.add(.2, [])
        tracker.add(.4, [face(.31)])
        tracker.add(5, [face(.31)])
        self.assertEqual(len(tracker.tracks), 2)
        self.assertEqual(len(tracker.tracks[0]["samples"]), 2)

    def test_rotation_and_pixel_aspect(self):
        self.assertEqual(display_dimensions({"width": 1920, "height": 1080, "side_data_list": [{"rotation": -90}]}), (1080, 1920))
        self.assertEqual(display_dimensions({"width": 720, "height": 576, "sample_aspect_ratio": "16:15"}), (768, 576))

if __name__ == "__main__":
    unittest.main()
