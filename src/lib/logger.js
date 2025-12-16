/**
 * Clair's Logger
 */

class Logger {
  constructor(prefix = 'Clair') {
    this.prefix = prefix;
  }

  _format(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${this.prefix}] ${level}: ${message}${metaStr}`;
  }

  info(message, meta) {
    console.log(this._format('INFO', message, meta));
  }

  warn(message, meta) {
    console.warn(this._format('WARN', message, meta));
  }

  error(message, meta) {
    console.error(this._format('ERROR', message, meta));
  }

  debug(message, meta) {
    if (process.env.DEBUG) {
      console.log(this._format('DEBUG', message, meta));
    }
  }
}

module.exports = { Logger };
