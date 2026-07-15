import { LANGUAGES } from "../data/languages.js";

export function populateLanguageSelector(select, selectedCode) {
  const fragment = document.createDocumentFragment();

  LANGUAGES.forEach((language) => {
    const option = document.createElement("option");
    option.value = language.code;
    option.textContent = `${language.name} (${language.nativeName})`;
    option.selected = language.code === selectedCode;
    fragment.appendChild(option);
  });

  select.replaceChildren(fragment);
}

export function keepLanguagesDifferent(changedSelect, otherSelect) {
  if (changedSelect.value !== otherSelect.value) {
    return;
  }

  const fallback = [...otherSelect.options].find((option) => option.value !== changedSelect.value);

  if (fallback) {
    otherSelect.value = fallback.value;
  }
}
