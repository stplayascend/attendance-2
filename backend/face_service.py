"""Face recognition service using InsightFace (RetinaFace + ArcFace 512-d).

Singleton model loader; base64 image utilities; cosine similarity matching.
"""
import base64
import io
from typing import List, Dict, Optional, Tuple

import numpy as np
import cv2
from PIL import Image

_FACE_APP = None


def get_face_app():
    """Lazy-load the InsightFace model once per process."""
    global _FACE_APP
    if _FACE_APP is None:
        from insightface.app import FaceAnalysis
        app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        app.prepare(ctx_id=0, det_size=(640, 640))
        _FACE_APP = app
    return _FACE_APP


def _b64_to_bgr(b64: str) -> np.ndarray:
    """Decode a base64 (with or without data-url prefix) image to a BGR np array."""
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    arr = np.array(img)
    return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)


def detect_and_embed(image_b64: str) -> List[Dict]:
    """Detect faces in an image; return list of dicts with bbox and 512-d embedding (list)."""
    app = get_face_app()
    img = _b64_to_bgr(image_b64)
    faces = app.get(img)
    out = []
    for f in faces:
        emb = f.normed_embedding.astype(float).tolist()  # 512-d normalized
        bbox = [int(x) for x in f.bbox.tolist()]
        out.append({
            "bbox": bbox,
            "embedding": emb,
            "det_score": float(f.det_score),
        })
    return out


def extract_single_embedding(image_b64: str) -> Optional[List[float]]:
    """Return the highest-confidence face embedding (or None)."""
    faces = detect_and_embed(image_b64)
    if not faces:
        return None
    faces.sort(key=lambda f: f["det_score"], reverse=True)
    return faces[0]["embedding"]


def cosine_similarity(a: List[float], b: List[float]) -> float:
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    denom = (np.linalg.norm(va) * np.linalg.norm(vb)) or 1e-8
    return float(np.dot(va, vb) / denom)


def match_embedding(
    query_emb: List[float],
    students: List[Dict],
    threshold: float = 0.40,
) -> Optional[Tuple[Dict, float]]:
    """Find best matching student above threshold.

    students: list of {student_id, name, embeddings:[[...], ...]}
    Returns (student_dict, best_sim) or None.
    """
    best = None
    best_sim = -1.0
    for s in students:
        for emb in s.get("embeddings", []):
            sim = cosine_similarity(query_emb, emb)
            if sim > best_sim:
                best_sim = sim
                best = s
    if best is not None and best_sim >= threshold:
        return best, best_sim
    return None
