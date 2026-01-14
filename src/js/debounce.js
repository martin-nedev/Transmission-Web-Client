
export function debounce(callback, wait = 100) {
  let timeout = null;
  return (...arguments_) => {
    if (!timeout) {
      timeout = setTimeout(() => {
        timeout = null;
        callback(...arguments_);
      }, wait);
    }
  };
}