// Netlify Scheduled Function (de 15 em 15 minutos): pedidos que expiram, lista de espera
// e uma cópia de segurança diária da base de dados (últimas 14), tudo no Netlify Blobs.
import lib from '../lib/handler.js';

export default async () => {
  await lib.runScheduled();
  return new Response('ok');
};

export const config = { schedule: '*/15 * * * *' };
