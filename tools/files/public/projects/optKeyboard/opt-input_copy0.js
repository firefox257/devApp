// opt-input.js
export function attachOptInput(el) {
  if (el.dataset.optAttached) return;
  el.dataset.optAttached = 'true';
  el.dataset.optEnabled = 'true';
  el.setAttribute('inputmode', 'none'); // Suppress native mobile KB

  const getValue = () => el.isContentEditable ? el.innerText : el.value ?? '';

  const dispatch = (name, detail = {}, cancelable = true) => {
    const evt = new CustomEvent(`opt${name}`, {
      detail: { target: el, ...detail },
      bubbles: true, cancelable
    });
    const ok = el.dispatchEvent(evt);
    if (!ok && detail.preventDefault) detail.preventDefault();
    return ok;
  };

  el.optSetValue = (val, cursorPos) => {
    if (el.isContentEditable) el.innerText = val;
    else el.value = val;
    if (typeof cursorPos === 'number' && el.setSelectionRange) el.setSelectionRange(cursorPos, cursorPos);
    dispatch('Input', { inputType: 'insertText', value: getValue(), source: 'programmatic' }, false);
  };
  el.optFocus = () => el.focus();
  el.optBlur = () => el.blur();

  el.addEventListener('focus', () => dispatch('Focus', { value: getValue() }, false));
  el.addEventListener('blur', () => dispatch('Blur', { value: getValue() }, false));

  el.addEventListener('keydown', e => dispatch('Keydown', {
    key: e.key, code: e.code, repeat: e.repeat,
    ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey,
    preventDefault: () => e.preventDefault(), nativeEvent: e
  }));
  el.addEventListener('keyup', e => dispatch('Keyup', {
    key: e.key, code: e.code,
    ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey,
    preventDefault: () => e.preventDefault(), nativeEvent: e
  }));

  el.addEventListener('beforeinput', e => dispatch('Beforeinput', {
    inputType: e.inputType, data: e.data, dataTransfer: e.dataTransfer,
    preventDefault: () => e.preventDefault(), nativeEvent: e
  }));
  el.addEventListener('input', e => dispatch('Input', {
    inputType: e.inputType, data: e.data, value: getValue(), nativeEvent: e
  }, false));

  ['compositionstart', 'compositionupdate', 'compositionend'].forEach(type => {
    el.addEventListener(type, e => dispatch(type.replace(/^composition/, 'Composition'), {
      data: e.data, nativeEvent: e
    }, type === 'compositionstart'));
  });
}