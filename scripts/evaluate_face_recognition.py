#!/usr/bin/env python3
"""
Face Recognition Model Evaluation & Threshold Calibration Script.
Performs pairwise similarity evaluation across genuine and impostor pairs,
computes TAR/FAR/FRR/TRR across threshold sweeps, and generates visualization plots.
"""

import math
import os
from pathlib import Path
import sys
from typing import Dict, List, Tuple
import cv2
import numpy as np

# Ensure app package is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.face import FaceEmbedder, FacePreprocessor, cosine_similarity


def generate_synthetic_eval_dataset(base_dir: Path, num_identities: int = 5, images_per_id: int = 4):
    """Generates synthetic face dataset with distinct intra-identity features for evaluation."""
    print(f"[*] Generating synthetic evaluation dataset: {num_identities} identities, {images_per_id} images each...")
    base_dir.mkdir(parents=True, exist_ok=True)

    for id_idx in range(1, num_identities + 1):
        person_dir = base_dir / f"person_{id_idx:03d}"
        person_dir.mkdir(exist_ok=True)

        # Unique face feature seed per identity
        base_hue = int((id_idx * 50) % 180)

        for img_idx in range(1, images_per_id + 1):
            img_path = person_dir / f"image_{img_idx:02d}.jpg"
            if img_path.exists():
                continue

            # Create face image with intra-class variations (brightness/scale)
            img = np.ones((400, 400, 3), dtype=np.uint8) * 230

            # Identity-specific face coloration
            face_color = cv2.cvtColor(np.uint8([[[base_hue, 160, 200]]]), cv2.COLOR_HSV2BGR)[0][0].tolist()

            # Slight variation per image
            scale_var = 1.0 + (img_idx - 2) * 0.05
            w_var = int(40 * scale_var)
            h_var = int(60 * scale_var)

            center_x, center_y = 200, 200
            cv2.ellipse(img, (center_x, center_y), (w_var, h_var), 0, 0, 360, face_color, -1)
            cv2.circle(img, (center_x - 15, center_y - 15), 6, (0, 0, 0), -1)
            cv2.circle(img, (center_x + 15, center_y - 15), 6, (0, 0, 0), -1)
            cv2.ellipse(img, (center_x, center_y + 20), (15, 8), 0, 0, 180, (0, 0, 0), 2)

            cv2.imwrite(str(img_path), img)


def load_dataset_embeddings(dataset_dir: Path) -> Dict[str, List[Tuple[str, List[float]]]]:
    """Loads labeled images and extracts normalized face embeddings."""
    preprocessor = FacePreprocessor()
    embedder = FaceEmbedder()

    dataset_embeddings: Dict[str, List[Tuple[str, List[float]]]] = {}

    person_dirs = sorted([d for d in dataset_dir.iterdir() if d.is_dir()])
    for pdir in person_dirs:
        person_id = pdir.name
        dataset_embeddings[person_id] = []

        image_files = sorted(list(pdir.glob("*.jpg")) + list(pdir.glob("*.png")) + list(pdir.glob("*.jpeg")))
        for img_file in image_files:
            try:
                img_bytes = img_file.read_bytes()
                img = preprocessor.validate_image(img_bytes)
                detection = preprocessor.preprocess(img, single_face_only=False)
                res = embedder.encode(detection.cropped_face)
                dataset_embeddings[person_id].append((img_file.name, res.embedding))
            except Exception as e:
                print(f"[!] Warning: Could not process {img_file}: {e}")

    return dataset_embeddings


def compute_pairs(
    dataset_embeddings: Dict[str, List[Tuple[str, List[float]]]]
) -> Tuple[List[float], List[float]]:
    """Generates all pairwise genuine (same person) and impostor (different person) similarity scores."""
    genuine_scores: List[float] = []
    impostor_scores: List[float] = []

    identities = list(dataset_embeddings.keys())

    # Genuine pairs (Same identity, different images)
    for person_id, items in dataset_embeddings.items():
        n = len(items)
        for i in range(n):
            for j in range(i + 1, n):
                sim = cosine_similarity(items[i][1], items[j][1])
                genuine_scores.append(sim)

    # Impostor pairs (Different identities)
    for i in range(len(identities)):
        for j in range(i + 1, len(identities)):
            id1, id2 = identities[i], identities[j]
            for name1, vec1 in dataset_embeddings[id1]:
                for name2, vec2 in dataset_embeddings[id2]:
                    sim = cosine_similarity(vec1, vec2)
                    impostor_scores.append(sim)

    return genuine_scores, impostor_scores


def compute_stats(scores: List[float]) -> Dict[str, float]:
    if not scores:
        return {"mean": 0.0, "median": 0.0, "min": 0.0, "max": 0.0, "std": 0.0}
    arr = np.array(scores, dtype=np.float64)
    return {
        "mean": float(np.mean(arr)),
        "median": float(np.median(arr)),
        "min": float(np.min(arr)),
        "max": float(np.max(arr)),
        "std": float(np.std(arr)),
    }


def evaluate_threshold_grid(
    genuine_scores: List[float], impostor_scores: List[float], thresholds: List[float]
) -> List[Dict[str, float]]:
    results = []

    n_gen = len(genuine_scores)
    n_imp = len(impostor_scores)

    for t in thresholds:
        if n_gen > 0:
            true_accepts = sum(1 for s in genuine_scores if s >= t)
            tar = true_accepts / n_gen
            frr = 1.0 - tar
        else:
            tar, frr = 0.0, 1.0

        if n_imp > 0:
            false_accepts = sum(1 for s in impostor_scores if s >= t)
            far = false_accepts / n_imp
            trr = 1.0 - far
        else:
            far, trr = 0.0, 1.0

        results.append(
            {
                "threshold": round(t, 2),
                "TAR": round(tar, 4),
                "FAR": round(far, 4),
                "FRR": round(frr, 4),
                "TRR": round(trr, 4),
            }
        )

    return results


def plot_visualizations(
    genuine_scores: List[float],
    impostor_scores: List[float],
    grid_results: List[Dict[str, float]],
    output_dir: Path,
):
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        output_dir.mkdir(parents=True, exist_ok=True)

        # 1. Similarity Distribution Histogram
        plt.figure(figsize=(8, 5))
        plt.hist(genuine_scores, bins=25, alpha=0.6, label="Genuine Pairs (Same)", color="green", density=True)
        plt.hist(impostor_scores, bins=25, alpha=0.6, label="Impostor Pairs (Diff)", color="red", density=True)
        plt.xlabel("Cosine Similarity Score")
        plt.ylabel("Density")
        plt.title("Face Recognition Similarity Score Distribution")
        plt.legend()
        plt.grid(True, linestyle="--", alpha=0.5)
        plt.tight_layout()
        plt.savefig(output_dir / "distribution_plot.png")
        plt.close()

        # 2. FAR vs FRR Curve
        thresholds = [r["threshold"] for r in grid_results]
        fars = [r["FAR"] for r in grid_results]
        frrs = [r["FRR"] for r in grid_results]

        plt.figure(figsize=(8, 5))
        plt.plot(thresholds, fars, "r-o", label="False Accept Rate (FAR)")
        plt.plot(thresholds, frrs, "b-s", label="False Reject Rate (FRR)")
        plt.xlabel("Cosine Similarity Threshold")
        plt.ylabel("Rate")
        plt.title("FAR vs FRR Threshold Tradeoff")
        plt.legend()
        plt.grid(True, linestyle="--", alpha=0.5)
        plt.tight_layout()
        plt.savefig(output_dir / "far_frr_curve.png")
        plt.close()

        # 3. ROC Curve (TAR vs FAR)
        tars = [r["TAR"] for r in grid_results]
        plt.figure(figsize=(6, 6))
        plt.plot(fars, tars, "b-o", label="ROC Curve")
        plt.plot([0, 1], [0, 1], "k--", label="Random Choice")
        plt.xlabel("False Accept Rate (FAR)")
        plt.ylabel("True Accept Rate (TAR)")
        plt.title("Receiver Operating Characteristic (ROC)")
        plt.legend()
        plt.grid(True, linestyle="--", alpha=0.5)
        plt.tight_layout()
        plt.savefig(output_dir / "roc_curve.png")
        plt.close()

        print(f"[+] Saved evaluation plots to {output_dir}")
    except Exception as e:
        print(f"[!] Plotting skipped: {e}")


def main():
    dataset_dir = Path("data/face_eval")
    output_dir = Path("eval_output")

    if not dataset_dir.exists() or not any(dataset_dir.iterdir()):
        generate_synthetic_eval_dataset(dataset_dir)

    print(f"[*] Loading dataset embeddings from {dataset_dir}...")
    dataset_embeddings = load_dataset_embeddings(dataset_dir)

    num_identities = len(dataset_embeddings)
    total_images = sum(len(items) for items in dataset_embeddings.values())
    print(f"[+] Found {num_identities} identities, {total_images} total images.")

    genuine_scores, impostor_scores = compute_pairs(dataset_embeddings)
    print(f"[+] Generated {len(genuine_scores)} genuine pairs and {len(impostor_scores)} impostor pairs.")

    gen_stats = compute_stats(genuine_scores)
    imp_stats = compute_stats(impostor_scores)

    thresholds = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90]
    grid_results = evaluate_threshold_grid(genuine_scores, impostor_scores, thresholds)

    plot_visualizations(genuine_scores, impostor_scores, grid_results, output_dir)

    # Print summary report
    print("\n" + "=" * 60)
    print("FACE RECOGNITION EVALUATION SUMMARY REPORT")
    print("=" * 60)
    print(f"Identities Evaluated: {num_identities}")
    print(f"Total Images: {total_images}")
    print(f"Genuine Pairs: {len(genuine_scores)} | Impostor Pairs: {len(impostor_scores)}")
    print("\n--- Genuine Pair Similarity Stats ---")
    for k, v in gen_stats.items():
        print(f"  {k.capitalize()}: {v:.4f}")

    print("\n--- Impostor Pair Similarity Stats ---")
    for k, v in imp_stats.items():
        print(f"  {k.capitalize()}: {v:.4f}")

    print("\n--- Threshold Calibration Table ---")
    print(f"{'Threshold':<10} | {'TAR':<8} | {'FAR':<8} | {'FRR':<8} | {'TRR':<8}")
    print("-" * 52)
    for r in grid_results:
        print(f"{r['threshold']:<10} | {r['TAR']:<8} | {r['FAR']:<8} | {r['FRR']:<8} | {r['TRR']:<8}")

    print("=" * 60)


if __name__ == "__main__":
    main()
