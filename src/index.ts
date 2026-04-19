import './config'; // Validate env vars before anything else
import { createBot } from './bot';
import { startScheduler } from './services/scheduler';

async function main(): Promise<void> {
  const bot = createBot();

  startScheduler(bot);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[${signal}] Shutting down gracefully...`);
    bot.stop(signal);
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  await bot.launch();
  console.log('🚀 Bot is running');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
