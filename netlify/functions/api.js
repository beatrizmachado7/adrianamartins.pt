// Netlify Function: o servidor do site (marcações, painel, horários, fotografias) — ver netlify/lib/handler.js
import lib from '../lib/handler.js';

export default async (req, context) => lib.handleRequest(req, context);

export const config = { path: ['/api/*', '/uploads/*', '/sitemap.xml', '/robots.txt'] };
