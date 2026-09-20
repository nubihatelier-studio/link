"""Genera el catálogo a partir del PDF de la cartilla.

Uso: python3 extraer.py "codigos miyuki db 1.pdf" > cartilla.json
"""
import json
import sys
import tempfile
from pathlib import Path

import fitz

import lector


def main(pdf: str) -> None:
    doc = fitz.open(pdf)
    todo = {}
    with tempfile.TemporaryDirectory() as tmp:
        for i in range(len(doc)):
            f = str(Path(tmp) / f'pg{i+1}.png')
            doc[i].get_pixmap(dpi=300).save(f)
            r = lector.pagina(f)
            print(f'página {i+1}: {len(r)} códigos', file=sys.stderr)
            todo.update(r)
    print(f'TOTAL: {len(todo)}', file=sys.stderr)
    json.dump({k: v['hex'] for k, v in sorted(todo.items())}, sys.stdout, indent=0)


if __name__ == '__main__':
    main(sys.argv[1])
