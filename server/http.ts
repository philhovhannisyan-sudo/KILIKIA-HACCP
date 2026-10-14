import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Actor } from './core/actor';
import type { Store } from './store';

// Каждый маршрут /api обязан объявить доступ в config.auth:
//   'public'  — без входа; 'user' — любой вошедший; 'engine' — право проверяет движок автоматов по таблице переходов;
//   иначе — код права «модуль.объект.действие», который проверяется до вызова обработчика.
export type AuthSpec = 'public' | 'user' | 'engine' | string;

declare module 'fastify' {
  interface FastifyContextConfig { auth?: AuthSpec }
  interface FastifyRequest { actor: Actor | null }
}

export interface Ctx { store: Store; demoMode: boolean; testMode: boolean }

export type Handler = (req: FastifyRequest, reply: FastifyReply) => unknown;
export type RouteRegistrar = (app: FastifyInstance, ctx: Ctx) => void;

export function actorOf(req: FastifyRequest): Actor {
  if (!req.actor) throw new Error('actor missing on authenticated route');
  return req.actor;
}
