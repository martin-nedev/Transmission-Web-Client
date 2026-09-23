const pluralRules = new Intl.PluralRules();
const currentLocale = pluralRules.resolvedOptions().locale;
const numberFormat = new Intl.NumberFormat(currentLocale);

const kilo = 1000;
const memFormatters = [
  new Intl.NumberFormat(currentLocale, {
    maximumFractionDigits: 0,
    style: 'unit',
    unit: 'byte',
  }),
  new Intl.NumberFormat(currentLocale, {
    maximumFractionDigits: 0,
    style: 'unit',
    unit: 'kilobyte',
  }),
  new Intl.NumberFormat(currentLocale, {
    maximumFractionDigits: 0,
    style: 'unit',
    unit: 'megabyte',
  }),
  new Intl.NumberFormat(currentLocale, {
    maximumFractionDigits: 2,
    style: 'unit',
    unit: 'gigabyte',
  }),
  new Intl.NumberFormat(currentLocale, {
    maximumFractionDigits: 2,
    style: 'unit',
    unit: 'terabyte',
  }),
  new Intl.NumberFormat(currentLocale, {
    maximumFractionDigits: 2,
    style: 'unit',
    unit: 'petabyte',
  }),
];

const fmtKBps = new Intl.NumberFormat(currentLocale, {
  maximumFractionDigits: 1,
  style: 'unit',
  unit: 'kilobyte-per-second',
});
const fmtMBps = new Intl.NumberFormat(currentLocale, {
  maximumFractionDigits: 1,
  style: 'unit',
  unit: 'megabyte-per-second',
});
const fmtGBps = new Intl.NumberFormat(currentLocale, {
  maximumFractionDigits: 2,
  style: 'unit',
  unit: 'gigabyte-per-second',
});

export const Formatter = {
  countString(msgid, msgidPlural, n) {
    return `${this.number(n)} ${this.ngettext(msgid, msgidPlural, n)}`;
  },

  mem(bytes) {
    if (bytes < 0) {
      return 'Unknown';
    }
    if (bytes === 0) {
      return 'None';
    }

    let size = bytes;
    for (const nf of memFormatters) {
      if (size < kilo) {
        return nf.format(size);
      }
      size /= kilo;
    }

    return 'E2BIG';
  },

  ngettext(msgid, msgidPlural, n) {
    return pluralRules.select(n) === 'one' ? msgid : msgidPlural;
  },

  number(number) {
    return numberFormat.format(number);
  },

  percentString(x, decimalPlaces) {
    decimalPlaces = x < 100 ? decimalPlaces : 0;
    const returnValue = Math.floor(x * 10 ** decimalPlaces) / 10 ** decimalPlaces;
    return returnValue.toFixed(decimalPlaces);
  },

  ratioString(x) {
    if (x === -1) {
      return 'None';
    }
    if (x === -2) {
      return '&infin;';
    }
    return this.percentString(x, 1);
  },

  size(bytes) {
    return this.mem(bytes);
  },

  speed(KBps) {
    if (KBps < 999.95) {
      return fmtKBps.format(KBps);
    } else if (KBps < 999_950) {
      return fmtMBps.format(KBps / 1000);
    }
    return fmtGBps.format(KBps / 1_000_000);
  },

  speedBps(Bps) {
    return this.speed(this.toKBps(Bps));
  },

  stringSanitizer(str) {
    return ['E2BIG', 'NaN'].some((badStr) => str.includes(badStr)) ? `…` : str;
  },

  timeInterval(seconds, granularDepth = 3) {
    const days = Math.floor(seconds / 86_400);
    let buffer = [];
    if (days) {
      buffer.push(this.countString('day', 'days', days));
    }

    const hours = Math.floor((seconds % 86_400) / 3600);
    if (days || hours) {
      buffer.push(this.countString('hour', 'hours', hours));
    }

    const minutes = Math.floor((seconds % 3600) / 60);
    if (days || hours || minutes) {
      buffer.push(this.countString('minute', 'minutes', minutes));
      buffer = buffer.slice(0, granularDepth);
      return buffer.length > 1
        ? `${buffer.slice(0, -1).join(', ')} and ${buffer.slice(-1)}`
        : buffer[0];
    }

    return this.countString('second', 'seconds', Math.floor(seconds % 60));
  },

  timestamp(seconds) {
    if (!seconds) {
      return 'N/A';
    }

    const myDate = new Date(seconds * 1000);
    const now = new Date();

    let date = '';
    let time = '';

    const sameYear = now.getFullYear() === myDate.getFullYear();
    const sameMonth = now.getMonth() === myDate.getMonth();

    const dateDiff = now.getDate() - myDate.getDate();
    if (sameYear && sameMonth && Math.abs(dateDiff) <= 1) {
      if (dateDiff === 0) {
        date = 'Today';
      } else if (dateDiff === 1) {
        date = 'Yesterday';
      } else {
        date = 'Tomorrow';
      }
    } else {
      date = myDate.toDateString();
    }

    let hours = myDate.getHours();
    let period = 'AM';
    if (hours > 12) {
      hours = hours - 12;
      period = 'PM';
    }
    if (hours === 0) {
      hours = 12;
    }
    if (hours < 10) {
      hours = `0${hours}`;
    }
    let minutes = myDate.getMinutes();
    if (minutes < 10) {
      minutes = `0${minutes}`;
    }
    seconds = myDate.getSeconds();
    if (seconds < 10) {
      seconds = `0${seconds}`;
    }

    time = [hours, minutes, seconds].join(':');

    return [date, time, period].join(' ');
  },

  toKBps(Bps) {
    return Math.floor(Bps / kilo);
  },
};