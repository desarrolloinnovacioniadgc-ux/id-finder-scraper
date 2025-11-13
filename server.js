require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

async function fetchWithUA(url) {
  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115 Safari/537.36'
    }
  });
}

// ===== FACEBOOK SCRAPER =====
app.get('/api/fb-id-scrape', async (req, res) => {
  const username = (req.query.username || '').trim();
  if (!username) return res.status(400).json({ error: 'username requerido' });

  const urls = [
    `https://mbasic.facebook.com/${encodeURIComponent(username)}`,
    `https://m.facebook.com/${encodeURIComponent(username)}`,
    `https://www.facebook.com/${encodeURIComponent(username)}`
  ];

  try {
    for (const url of urls) {
      const r = await fetchWithUA(url);
      if (r.status === 200) {
        const html = await r.text();

        const patterns = [
          /profile\.php\?id=(\d{5,})/i,
          /entity_id["']?:["']?(\d{5,})/i,
          /ft_ent_identifier["']?:["']?(\d{5,})/i,
          /fb:\/\/profile\/(\d{5,})/i,
          /owner["']?\s*:\s*\{[^}]*["']id["']\s*:\s*["']?(\d{5,})/i
        ];

        for (const p of patterns) {
          const match = html.match(p);
          if (match) return res.json({ id: match[1], source: url });
        }

        const $ = cheerio.load(html);
        const meta = $('meta').map((_, el) => $(el).attr('content')).get().join(' ');
        const metaMatch = meta.match(/profile\.php\?id=(\d{5,})/i);
        if (metaMatch) return res.json({ id: metaMatch[1], source: url });
      }
    }

    res.status(404).json({ error: 'No se pudo obtener ID pública. Perfil privado o bloqueado.' });
  } catch (e) {
    res.status(500).json({ error: 'Error interno', detail: e.message });
  }
});

// ===== INSTAGRAM SCRAPER =====
app.get('/api/ig-id', async (req, res) => {
  const username = (req.query.username || '').trim();
  if (!username) return res.status(400).json({ error: 'username requerido' });

  try {
    const url = `https://www.instagram.com/${encodeURIComponent(username)}/`;
    const r = await fetchWithUA(url);
    if (r.status === 404) return res.status(404).json({ error: 'Usuario no encontrado (404)' });
    const html = await r.text();

    const profilePage = html.match(/profilePage_(\d+)/);
    if (profilePage) return res.json({ id: profilePage[1], source: 'profilePage_' });

    const jsonID = html.match(/"id":"(\d+)"/);
    if (jsonID) return res.json({ id: jsonID[1], source: 'json_id' });

    const $ = cheerio.load(html);
    const ld = $('script[type="application/ld+json"]').html();
    if (ld) {
      const obj = JSON.parse(ld);
      if (obj && obj.mainEntityOfPage && obj.mainEntityOfPage['@id']) {
        const possible = obj.mainEntityOfPage['@id'].match(/(\d+)/);
        if (possible) return res.json({ id: possible[1], source: 'ld_json' });
      }
    }

    res.status(404).json({ error: 'No se pudo extraer la ID pública.' });
  } catch (e) {
    res.status(500).json({ error: 'Error interno', detail: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor en http://localhost:${PORT}`));
