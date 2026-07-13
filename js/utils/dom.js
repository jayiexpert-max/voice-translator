export function getElement(id) {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing required element: #${id}`);
  }

  return element;
}

export function setText(element, value, isPlaceholder = false, placeholderClass = "placeholder") {
  element.textContent = value;
  element.classList.toggle(placeholderClass, isPlaceholder);
}

export function setDisabled(element, isDisabled) {
  element.disabled = isDisabled;
}
