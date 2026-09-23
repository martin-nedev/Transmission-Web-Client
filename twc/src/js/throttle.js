export function throttle(callback, wait = 100) {
  let timeout = null;
  return (...args) => {
    if (!timeout) {
      timeout = setTimeout(() => {
        timeout = null;
        callback(...args);
      }, wait);
    }
  };
}
