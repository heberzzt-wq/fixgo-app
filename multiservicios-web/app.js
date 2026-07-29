const menuButton = document.querySelector('.menu');
const navLinks = document.querySelector('#nav-links');

menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  navLinks.classList.toggle('open', !open);
});

navLinks.addEventListener('click', event => {
  if (!event.target.closest('a')) return;
  menuButton.setAttribute('aria-expanded', 'false');
  navLinks.classList.remove('open');
});

const requestForm = document.querySelector('#request-form');
const formStatus = document.querySelector('#form-status');

requestForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!requestForm.reportValidity()) return;
  const data = new FormData(requestForm);
  const subject = `Solicitud de servicio · ${data.get('service')}`;
  const body = [
    `Nombre: ${data.get('name')}`,
    `Correo: ${data.get('email')}`,
    `Tipo de cliente: ${data.get('clientType')}`,
    `Ciudad o zona aproximada: ${data.get('zone')}`,
    `Servicio: ${data.get('service')}`,
    '',
    'Descripción:',
    data.get('details')
  ].join('\n');
  formStatus.textContent = 'Se abrirá tu aplicación de correo para revisar y enviar la solicitud.';
  window.location.href = `mailto:heberzzt@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
