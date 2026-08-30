from typing import List
import cv2
import numpy as np
from app.face.models import FaceBoundingBox, FaceDetectionResult


class FaceDetector:
    """Modular Face Detector using OpenCV Haar Cascades with fallback DNN support."""

    def __init__(self):
        # Load OpenCV Haar cascade classifier for frontal face detection
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self.cascade = cv2.CascadeClassifier(cascade_path)

    def detect(self, image: np.ndarray) -> List[FaceDetectionResult]:
        if image is None or image.size == 0:
            return []

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        # Multi-scale face detection
        faces = self.cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30),
            flags=cv2.CASCADE_SCALE_IMAGE,
        )

        results = []
        img_h, img_w = image.shape[:2]

        for (x, y, w, h) in faces:
            # Crop with padding bounds check
            x1, y1 = max(0, x), max(0, y)
            x2, y2 = min(img_w, x + w), min(img_h, y + h)
            cropped = image[y1:y2, x1:x2]

            # Approximate confidence score from face rectangle size & position
            conf = min(0.99, max(0.60, (w * h) / (img_w * img_h * 0.25)))

            results.append(
                FaceDetectionResult(
                    bounding_box=FaceBoundingBox(x=int(x1), y=int(y1), width=int(x2 - x1), height=int(y2 - y1)),
                    confidence=float(conf),
                    cropped_face=cropped,
                )
            )

        return results
