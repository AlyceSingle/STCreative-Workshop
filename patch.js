const fs=require('fs');
let c=fs.readFileSync('backend/routes/workshop.js', 'utf8');
c=c.replace(/e\.entry_type='worldbook'/g, \"(e.entry_type='worldbook' OR e.entry_type='')\");
fs.writeFileSync('backend/routes/workshop.js', c);
