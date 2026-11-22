const fs = require('fs');

const TOLLS_FILE = './tolls.json';

// KGM ve güncel Türkiye otoyol/köprü tarife kaynaklarından 1. sınıf araç ücretlerini tarar
const SOURCES = [
  'https://www.kgm.gov.tr/Sayfalar/KGM/SiteTr/Otoyollar/OtoyolUcretleri.aspx',
  'https://www.hangiKredi.com/bilgi-merkezi/kopru-ve-otoyol-gecis-ucretleri',
  'https://www.sigortam.net/kopru-ve-otoyol-gecis-ucretleri',
];

function extractFee(html, patterns) {
  for (const regex of patterns) {
    const match = html.match(regex);
    if (match && match[1]) {
      const val = parseFloat(match[1].replace('.', '').replace(',', '.'));
      if (!Number.isNaN(val) && val >= 20 && val <= 3000) {
        return Math.round(val);
      }
    }
  }
  return null;
}

async function run() {
  const current = JSON.parse(fs.readFileSync(TOLLS_FILE, 'utf8'));
  let combinedHtml = '';

  for (const url of SOURCES) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TrafikAsistanimBot/1.0)',
          'Accept-Language': 'tr-TR,tr;q=0.9',
        },
      });
      if (res.ok) {
        const text = await res.text();
        // HTML etiketlerini temizleyip düz metin haline getir
        combinedHtml += ' ' + text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      }
    } catch (err) {
      console.log(`Kaynak okunamadı (${url}):`, err.message);
    }
  }

  if (!combinedHtml.trim()) {
    console.log('Hiçbir kaynaktan veri alınamadı, mevcut tolls.json korunuyor.');
    return;
  }

  const rules = {
    avrasya: [/Avrasya Tüneli[^0-9]{0,80}?(\d{2,4}(?:[.,]\d{1,2})?)\s*TL/i],
    bosphorus: [/(?:15 Temmuz|Fatih Sultan Mehmet|Boğaz Köprü)[^0-9]{0,80}?(\d{2,3}(?:[.,]\d{1,2})?)\s*TL/i],
    yss: [/Yavuz Sultan Selim[^0-9]{0,80}?(\d{2,3}(?:[.,]\d{1,2})?)\s*TL/i],
    osmangazi: [/Osmangazi Köprüsü[^0-9]{0,80}?(\d{3,4}(?:[.,]\d{1,2})?)\s*TL/i],
    canakkale: [/1915 Çanakkale[^0-9]{0,80}?(\d{3,4}(?:[.,]\d{1,2})?)\s*TL/i],
  };

  let changed = false;

  for (const toll of current.fixedTolls) {
    const patterns = rules[toll.id];
    if (!patterns) continue;
    const found = extractFee(combinedHtml, patterns);
    if (found && found !== toll.fee) {
      console.log(`Güncellendi: ${toll.name}: ${toll.fee} TL -> ${found} TL`);
      toll.fee = found;
      changed = true;
    }
  }

  if (changed) {
    current.updatedAt = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(TOLLS_FILE, JSON.stringify(current, null, 2) + '\n', 'utf8');
    console.log('tolls.json başarıyla güncellendi.');
  } else {
    console.log('Tarifelerde değişiklik tespit edilmedi.');
  }
}

run();
