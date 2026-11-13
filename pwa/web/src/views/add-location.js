import { ALL, symbol } from '../categories.js'
import { icon } from '../icons.js'

// Category → icon token lives in categories.js so Home, the dialog and Check-in agree.
const categoryIcon = symbol

export function openAddLocationDialog(onSave) {
  let category = 'Fitness'
  const dialog = document.createElement('dialog')
  dialog.className = 'add-location-dialog'
  dialog.innerHTML = `
    <div class="dialog-head">
      <h2>Add location</h2>
      <button type="button" class="dialog-close" aria-label="Close">${icon('x-circle', 22, { strokeWidth: 2 })}</button>
    </div>
    <div class="dialog-body">
      <label class="field-label" for="new-location-name">Name</label>
      <input id="new-location-name" class="dialog-input" type="text"
             placeholder="e.g. Fitness First Berlin - Mitte" autocomplete="off" spellcheck="false" />
      <span class="field-label dialog-category-label">Category</span>
      <div class="category-options" role="radiogroup" aria-label="Category"></div>
    </div>
    <div class="dialog-actions">
      <button type="button" class="dialog-cancel">Cancel</button>
      <button type="button" class="dialog-save" disabled>Save</button>
    </div>`

  const nameInput = dialog.querySelector('#new-location-name')
  const saveButton = dialog.querySelector('.dialog-save')
  const options = dialog.querySelector('.category-options')

  const renderOptions = () => {
    options.replaceChildren()
    for (const option of ALL) {
      const selected = option === category
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `category-option${selected ? ' is-selected' : ''}`
      button.setAttribute('role', 'radio')
      button.setAttribute('aria-checked', String(selected))
      button.innerHTML = `
        <span class="category-option-icon">${icon(categoryIcon(option), 15, { strokeWidth: 2.2 })}</span>
        <span>${option}</span>
        <span class="category-option-check">${selected ? icon('check', 16, { strokeWidth: 2.4 }) : ''}</span>`
      button.addEventListener('click', () => {
        category = option
        renderOptions()
      })
      options.append(button)
    }
  }

  const close = () => dialog.close()
  const save = () => {
    const name = nameInput.value.trim()
    if (!name) return
    onSave(name, category)
    close()
  }

  nameInput.addEventListener('input', () => {
    saveButton.disabled = nameInput.value.trim() === ''
  })
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') save()
  })
  dialog.querySelector('.dialog-cancel').addEventListener('click', close)
  dialog.querySelector('.dialog-close').addEventListener('click', close)
  saveButton.addEventListener('click', save)
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    close()
  })
  dialog.addEventListener('close', () => dialog.remove())

  renderOptions()
  document.body.append(dialog)
  dialog.showModal()
  requestAnimationFrame(() => nameInput.focus())
  return dialog
}
