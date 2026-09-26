# Сглобява самостоятелния сайт за GitHub Pages в ../matura-bel-site
import os, re, shutil
src = os.path.dirname(os.path.abspath(__file__)); dst = os.path.join(os.path.dirname(src), "matura-bel-site")
os.makedirs(dst, exist_ok=True)
for f in ["app.js", "works.js", "works12.js", "more11.js", "more12.js", "lang.js", "morelang.js", "essay.js", "supabase.sql"]:
    shutil.copy(os.path.join(src, f), dst)
if not os.path.exists(os.path.join(dst, "config.js")):
    shutil.copy(os.path.join(src, "config.js"), dst)
s = open(os.path.join(src, "index.html"), encoding="utf-8").read()
title = re.search(r"<title>.*?</title>", s).group(0)
s = s.replace(title, "", 1)
i = s.index("</style>") + len("</style>")
head, body = s[:i], s[i:]
body = body.replace('<script src="app.js"></script>',
  '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js"></script>\n<script src="config.js"></script>\n<script src="app.js"></script>')
doc = f"""<!doctype html>
<html lang="bg">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#E9A0A1">
{title}
{head.strip()}
</head>
<body>
{body.strip()}
</body>
</html>
"""
open(os.path.join(dst, "index.html"), "w", encoding="utf-8").write(doc)
print("built", dst)
