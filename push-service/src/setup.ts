// Configurador del servicio push:  docker compose run --rm push npm run setup
// Pide el token del usuario de servicio de GLPI, comprueba que funcione y que tenga los permisos
// de lectura necesarios, y lo guarda en /data/config.json. Dejarlo vacío desactiva el push (la
// app funciona igual, solo sin avisos con la app cerrada).
//   npm run setup -- --check   solo revisa la configuración actual, sin preguntar

import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadConfig, saveConfig, isConfigured, type PushConfig } from './config';

const check = process.argv.includes('--check');

const mask = (value: string) => (value ? `${value.slice(0, 4)}…${value.slice(-4)}` : '(vacío)');

const verify = async (config: PushConfig): Promise<boolean> => {
  const { GLPIService, getServiceSession } = await import('./glpi');
  console.log(`\nProbando la conexión con ${config.glpiUrl} ...`);
  let session;
  try {
    session = await getServiceSession(config, true);
  } catch (err: any) {
    console.log(`  ✗ GLPI no aceptó el token: ${err.message || err}`);
    if (/user_token/i.test(String(err.message || err))) {
      console.log('    Revisa en GLPI: Configuración → General → API → "Activar el inicio de sesión con un token externo"');
      console.log('    debe estar en Sí (si no, GLPI rechaza cualquier token), y que el token sea el "Token de API" del usuario.');
    }
    return false;
  }
  console.log(`  ✓ Sesión iniciada (perfil: ${session.activeProfile || '?'}, usuario #${session.userId})`);
  const headers = { 'App-Token': session.appToken, 'Session-Token': session.sessionToken };
  // Proyectos: hace falta "Ver todos" (READALL); con solo "Ver mis proyectos" GLPI le oculta los
  // proyectos y tareas donde el usuario de servicio no participa (o sea, todos)
  const READALL = 1024;
  const profile = (await (await fetch(`${config.glpiUrl}/apirest.php/getFullSession`, { headers })).json().catch(() => null))?.session?.glpiactiveprofile;
  const seesAllProjects = (Number(profile?.project) & READALL) === READALL;
  console.log(`  ${seesAllProjects ? '✓' : '✗'} Ver todos los proyectos${seesAllProjects ? '' : ' — en el perfil, pestaña "Herramientas" → fila "Proyecto": marca "Ver todos"'}`);
  const probe = async (label: string, path: string) => {
    const res = await fetch(`${config.glpiUrl}/apirest.php/${path}`, { headers });
    const ok = res.ok || res.status === 206;
    console.log(`  ${ok ? '✓' : '✗'} Leer ${label}${ok ? '' : ` (GLPI respondió ${res.status}: falta el permiso de lectura)`}`);
    return ok;
  };
  const results = [
    await probe('proyectos', 'Project?range=0-0'),
    await probe('equipos de tarea (responsables)', 'ProjectTaskTeam?range=0-0'),
    await probe('estados de proyecto', 'ProjectState?range=0-0'),
    await probe('grupos de usuarios', `User/${session.userId}/Group_User?range=0-0`)
  ];
  const quiet = console.log;
  console.log = () => {};
  let tasks = 0;
  try {
    tasks = [...(await GLPIService.getAllProjectTasks(session)).values()].reduce((n, list) => n + list.length, 0);
  } catch { /* se informa abajo */ } finally {
    console.log = quiet;
  }
  console.log(`  ${tasks > 0 ? '✓' : '!'} Tareas de proyecto visibles: ${tasks}${tasks > 0 ? '' : ' (si sí hay tareas, falta el permiso de lectura de tareas de proyecto)'}`);
  return seesAllProjects && results.every(Boolean);
};

const current = loadConfig();
console.log('ITPocket · Servicio de avisos push');
console.log('──────────────────────────────────');
console.log(`GLPI:            ${current.glpiUrl || '(sin configurar)'}`);
console.log(`App-Token:       ${mask(current.appToken)}`);
console.log(`Usuario servicio: ${mask(current.userToken)}`);
console.log(`Estado:          ${isConfigured(current) ? 'configurado' : 'DESACTIVADO (sin token del usuario de servicio)'}`);

if (check) {
  if (isConfigured(current)) await verify(current);
  process.exit(0);
}

console.log(`
Para avisar con la app cerrada, el servicio necesita un usuario de GLPI de SOLO LECTURA:
  1. Crea un perfil (p. ej. "ITPocket Push") con Lectura y "Ver todos" en Proyectos, y Lectura
     en Tareas de proyecto, Usuarios y Grupos.
  2. Crea un usuario (p. ej. itpocket-push) con ese perfil en la entidad raíz (recursiva).
  3. En su ficha → "Claves de acceso remoto" → regenera el Token de API y cópialo.
  4. Configuración → General → API → "Activar el inicio de sesión con un token externo" = Sí.
Deja el token vacío para no usar el push (la app funciona igual, sin avisos con la app cerrada).
`);

const rl = readline.createInterface({ input: stdin, output: stdout });
const ask = async (question: string, fallback: string) => (await rl.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim() || fallback;

const glpiUrl = (await ask('URL de GLPI (como la ve este servidor)', current.glpiUrl)).replace(/\/+$/, '');
const appTokenInput = await ask('App-Token del cliente API (Enter para conservar)', '');
const userToken = (await rl.question('Token de API del usuario de servicio (vacío = desactivar push): ')).trim();
const vapidSubject = await ask('Correo de contacto para los servicios de push', current.vapidSubject.replace(/^mailto:/, ''));
rl.close();

const next: PushConfig = {
  ...current,
  glpiUrl,
  appToken: appTokenInput || current.appToken,
  userToken,
  vapidSubject: /^(mailto:|https:)/.test(vapidSubject) ? vapidSubject : `mailto:${vapidSubject}`
};

if (!userToken) {
  saveConfig({ ...next, userToken: '' });
  console.log('\nPush DESACTIVADO. La app funciona normal, sin avisos con la app cerrada.');
  console.log('Reinicia el servicio para aplicar:  docker compose restart push');
  process.exit(0);
}

const ok = await verify(next);
saveConfig(next);
console.log(ok
  ? '\n✓ Configuración guardada. Reinicia el servicio:  docker compose restart push'
  : '\n! Configuración guardada, pero faltan permisos (ver arriba). Corrige el perfil en GLPI y vuelve a probar con:  npm run setup -- --check');
process.exit(0);
