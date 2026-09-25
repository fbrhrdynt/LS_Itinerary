# LS Itinerary

LS Itinerary adalah web app untuk mengatur perjalanan solo atau grup, itinerary harian, booking, budget per peserta, shared expenses, dan settlement.

## Production target

- Repository: `https://github.com/fbrhrdynt/LS_Itinerary`
- VPS directory: `/opt/ls_itinerary`
- Domain: `https://itinerary.febro.id`
- App listener: `127.0.0.1:3015`
- Runtime: Node.js 22 + systemd
- Database: PostgreSQL native
- Reverse proxy: Nginx using `/etc/nginx/conf.d/*.conf`

## Version 1.1

- Fix PostgreSQL `DATE` parsing that caused `Invalid time value` on the dashboard.
- Keep date-only values stable across timezone boundaries.
- Use `Asia/Jakarta` as the default application timezone for date status and default expense dates.
- Apply the anti-slop development filter with a project-specific `DESIGN.md`.
- Remove generic gradients, decorative glass effects, uppercase wide-tracked labels, and generic dashboard stat cards.
- Add visible keyboard focus states and clearer mobile reflow.
- Add date utility tests.

## Development filter

The project follows `DESIGN.md` and references the anti-slop project at `https://github.com/miqdadbadjuber/anti-slop`.

For a coding-agent project install:

```bash
npx antislop-ai
```

Choose project scope and the core plus UI, copywriting, human, layoutmobile, and code skills.

## Production `.env`

Example:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3015
APP_NAME=LogiSource Itinerary
APP_URL=https://itinerary.febro.id
APP_TIMEZONE=Asia/Jakarta
SESSION_SECRET=replace-with-a-long-random-secret
DATABASE_URL=postgresql://logisource_itinerary:password@127.0.0.1:5432/logisource_itinerary
DATABASE_SSL=false
```

## Install or update dependencies

```bash
cd /opt/ls_itinerary
npm install --omit=dev
npm run check
npm test
```

## systemd

Example service is available at `deploy/ls-itinerary.service.example`.

```bash
sudo cp deploy/ls-itinerary.service.example /etc/systemd/system/ls-itinerary.service
sudo systemctl daemon-reload
sudo systemctl enable --now ls-itinerary
sudo systemctl status ls-itinerary --no-pager
```

Health check:

```bash
curl http://127.0.0.1:3015/health
```

Expected response:

```json
{"ok":true,"service":"LogiSource Itinerary"}
```

## Nginx

This VPS uses `/etc/nginx/conf.d/*.conf`.

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/conf.d/itinerary.febro.id.conf
sudo nginx -t
sudo systemctl reload nginx
```

Then use Certbot for HTTPS:

```bash
sudo certbot --nginx -d itinerary.febro.id
```

## Logs

```bash
sudo journalctl -u ls-itinerary -n 100 --no-pager
sudo journalctl -u ls-itinerary -f
```

## Database backup

```bash
cd /opt/ls_itinerary
./deploy/backup.sh
```

Backups are written to `/opt/ls_itinerary/backups/` and files older than 14 days are removed.

## Future GitHub deployment

After the repository contains the project and the VPS checkout has the correct `origin`:

```bash
cd /opt/ls_itinerary
./deploy/deploy.sh
```

The script pulls `main`, installs production dependencies, runs checks and tests, restarts systemd, and verifies the health endpoint.
