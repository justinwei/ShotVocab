import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { config, paths } from './config.js';
import { migrate } from './db/database.js';
import { ensureDefaultUser } from './services/userService.js';
import wordsRouter from './routes/words.js';
import reviewsRouter from './routes/reviews.js';
import statsRouter from './routes/stats.js';

async function bootstrap() {
  migrate();
  ensureDefaultUser();

  if (!fs.existsSync(config.uploadsDir)) {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
  }

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '0.1.0' });
  });

  app.use('/uploads', express.static(config.uploadsDir));
  app.use('/api/words', wordsRouter);
  app.use('/api/reviews', reviewsRouter);
  app.use('/api/stats', statsRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  app.use((err, req, res, next) => {
    console.error(err);
    const status = err.status || 500;
    res.status(status).json({
      error: err.message || 'Internal Server Error'
    });
  });

  const port = config.port;
  const host = '0.0.0.0'; // 监听所有网络接口，允许外部访问
  app.listen(port, host, () => {
    console.log(`Server listening on ${host}:${port}`);
    console.log(`Local access: http://localhost:${port}`);
    console.log(`Network access: http://YOUR_IP:${port}`);
    console.log(`Uploads directory: ${path.resolve(config.uploadsDir)}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
