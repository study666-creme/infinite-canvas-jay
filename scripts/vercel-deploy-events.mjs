const fs = require('fs');
const https = require('https');

const auth = JSON.parse(fs.readFileSync(process.env.APPDATA + '/xdg.data/com.vercel.cli/auth.json', 'utf8'));
const teamId = 'team_Yx9OAaDQjv28cShhYACANruM';
const deploymentId = process.argv[2] || 'dpl_DJ1vT4SJKnWAjp3C8Hjs3Qmtfxui';

const url = `https://api.vercel.com/v13/deployments/${deploymentId}/events?teamId=${teamId}&limit=40`;

https.get(url, { headers: { Authorization: `Bearer ${auth.token}` } }, (res) => {
  let data = '';
  res.on('data', (c) => (data += c));
  res.on('end', () => {
    try {
      const events = JSON.parse(data);
      if (events.error) {
        console.error(events.error);
        return;
      }
      for (const e of events) {
        const t = e.payload?.text || e.text || JSON.stringify(e.payload || e);
        console.log(t);
      }
    } catch (err) {
      console.log(data);
    }
  });
}).on('error', console.error);
