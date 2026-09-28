"""Gera a visão geral (versão reduzida) dos mapas do projeto para o painel.

Baixa os .zip dos mapas do bucket "dados" do Supabase, reduz cada recorte e
monta um mosaico por mapa em img/mapas/<nome>.webp. Rode de novo sempre que
subir uma versão nova de algum mapa no Supabase, e depois publicar.ps1.

Uso (na pasta painel):  python gerar_visao_geral_mapas.py
"""

import io
import json
import re
import sys
import tempfile
import unicodedata
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image

METROS_POR_PIXEL = 1.5

MAPAS = [
    ('D2', 351849.7584, 7784342.6030, 354010.7511, 7794250.1072, 25, 90),
    ('C1', 351473.537, 7796577.542, 355442.406, 7803295.129, 30, 60),
    ('Contorno_Fundão', 352423.387, 7793005.057, 354770.603, 7797645.351, 15, 30),
    ('Contorno_Ibiraçu', 354902.080, 7806251.889, 357104.019, 7808991.788, 20, 30),
]

RAIZ = Path(__file__).resolve().parent
config = (RAIZ / 'js' / 'config.js').read_text(encoding='utf-8')
URL = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", config).group(1)
CHAVE = re.search(r"SUPABASE_KEY\s*=\s*'([^']+)'", config).group(1)
DESTINO = RAIZ / 'img' / 'mapas'


def sem_acento(texto):
    return ''.join(c for c in unicodedata.normalize('NFD', texto) if unicodedata.category(c) != 'Mn')


def versoes():
    pedido = urllib.request.Request(
        f'{URL}/rest/v1/versoes_dados?select=nome,versao,arquivo',
        headers={'apikey': CHAVE})
    with urllib.request.urlopen(pedido) as r:
        return {l['nome']: l for l in json.load(r)}


def baixar(arquivo, destino):
    url = f'{URL}/storage/v1/object/public/dados/{urllib.request.quote(arquivo)}'
    with urllib.request.urlopen(url) as r, open(destino, 'wb') as f:
        total = int(r.headers.get('content-length') or 0)
        feito = 0
        while bloco := r.read(1 << 20):
            f.write(bloco)
            feito += len(bloco)
            if total:
                print(f'\r  baixando {arquivo}: {feito * 100 // total}%', end='', flush=True)
    print()


def gerar(nome, sw_e, sw_n, ne_e, ne_n, cols, rows, arquivo_zip):
    larg_peca = round((ne_e - sw_e) / cols / METROS_POR_PIXEL)
    alt_peca = round((ne_n - sw_n) / rows / METROS_POR_PIXEL)
    mosaico = Image.new('RGBA', (larg_peca * cols, alt_peca * rows), (0, 0, 0, 0))
    usadas = 0
    with zipfile.ZipFile(arquivo_zip) as z:
        for info in z.infolist():
            m = re.search(r'(\d+)_(\d+)\.webp$', info.filename, re.I)
            if not m:
                continue
            linha, coluna = int(m.group(1)), int(m.group(2))
            if linha >= rows or coluna >= cols:
                continue
            with Image.open(io.BytesIO(z.read(info))) as peca:
                reduzida = peca.convert('RGBA').resize((larg_peca, alt_peca), Image.LANCZOS)
            mosaico.paste(reduzida, (coluna * larg_peca, linha * alt_peca))
            usadas += 1
    saida = DESTINO / f'{sem_acento(nome)}.webp'
    mosaico.save(saida, 'WEBP', quality=80, method=6)
    print(f'  {saida.name}: {mosaico.width}x{mosaico.height}, {usadas} recortes, '
          f'{saida.stat().st_size // 1024} KB')


def main():
    DESTINO.mkdir(parents=True, exist_ok=True)
    tabela = versoes()
    for nome, *coords in MAPAS:
        linha = tabela.get(nome)
        arquivo = linha['arquivo'] if linha else f'{sem_acento(nome)}.zip'
        print(f'{nome} (versão {linha["versao"] if linha else "?"})')
        with tempfile.TemporaryDirectory() as tmp:
            caminho = Path(tmp) / 'mapa.zip'
            baixar(arquivo, caminho)
            gerar(nome, *coords, caminho)
    print('Pronto. Agora rode publicar.ps1 e publique a dist no Netlify.')


if __name__ == '__main__':
    sys.exit(main())
