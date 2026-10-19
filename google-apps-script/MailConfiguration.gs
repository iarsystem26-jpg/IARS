// Server-only deployment configuration. The automated installer replaces this
// function remotely with generated values, without writing secrets to the repo.
function authEmailConfig_() {
  const properties = PropertiesService.getScriptProperties();
  return { secret: properties.getProperty('AUTH_EMAIL_WORKER_SECRET'), workerUrl: properties.getProperty('AUTH_EMAIL_WORKER_URL') };
}
