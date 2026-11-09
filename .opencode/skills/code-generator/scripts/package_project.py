#!/usr/bin/env python3
"""
package_project.py

Packages a generated Python project directory into a .zip file.

Usage:
    python scripts/package_project.py <project_folder> <output_zip_path>

Example:
    python scripts/package_project.py /tmp/my_project /sessions/.../outputs/my_project.zip
"""

import sys
import os
import zipfile
from pathlib import Path


def package_project(project_folder: str, output_zip: str) -> None:
    """
    Recursively zip a project folder.

    Args:
        project_folder: Path to the project directory to zip
        output_zip: Path where the output .zip should be written
    """
    project_path = Path(project_folder).resolve()
    output_path = Path(output_zip).resolve()

    if not project_path.exists():
        print(f"ERROR: Project folder not found: {project_path}")
        sys.exit(1)

    if not project_path.is_dir():
        print(f"ERROR: {project_path} is not a directory")
        sys.exit(1)

    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)

    file_count = 0
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in sorted(project_path.rglob("*")):
            # Skip __pycache__ and .pyc files
            if "__pycache__" in file_path.parts:
                continue
            if file_path.suffix == ".pyc":
                continue
            # Skip hidden files/dirs (e.g., .git)
            if any(part.startswith(".") and part not in (".env.example",)
                   for part in file_path.parts[len(project_path.parts):]):
                continue

            if file_path.is_file():
                arcname = file_path.relative_to(project_path.parent)
                zf.write(file_path, arcname)
                file_count += 1
                print(f"  Added: {arcname}")

    print(f"\nPackaged {file_count} files into: {output_path}")
    size_kb = output_path.stat().st_size / 1024
    print(f"Archive size: {size_kb:.1f} KB")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python package_project.py <project_folder> <output_zip_path>")
        sys.exit(1)

    package_project(sys.argv[1], sys.argv[2])
