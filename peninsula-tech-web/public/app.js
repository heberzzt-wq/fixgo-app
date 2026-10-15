'use strict';
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const PLATFORM_URL = 'https://fixgo-44e4d.web.app/';
  const slides = [
    {title:'Tecnología para resolver.<br><em>Personas para hacerlo.</em>', desc:'ADJUNTO conecta clientes, profesionales y operación en una sola experiencia digital desarrollada por Península Tech.', main:'Entrar a ADJUNTO', mainRole:'client', alt:'Soy profesional', altRole:'professional', art:'EL PUNTO DE ENCUENTRO',image:'assets/adjunto-oficial.png',imageAlt:'Logotipo oficial de ADJUNTO',caption:'Tecnología que nace de la experiencia.'},
    {title:'Tu experiencia.<br><em>Un espacio digital.</em>', desc:'Profesionales y especialistas pueden iniciar su recorrido en ADJUNTO y conectar su capacidad con necesidades reales.', main:'Entrar como profesional', mainRole:'professional', alt:'Explorar soluciones', altRole:'catalogue', art:'TALENTO Y TECNOLOGÍA',image:'assets/trabajo-03.jpg',imageAlt:'Fachada acristalada del archivo visual de Multiservicios de 2018',caption:'Trayectoria, oficio y tecnología en una misma visión.'},
    {title:'De una necesidad.<br><em>A una operación clara.</em>', desc:'ADJUNTO reúne el acceso a especialidades y el recorrido operativo dentro de una plataforma creada para crecer.', main:'Abrir ADJUNTO', mainRole:'client', alt:'Conocer Península Tech', altRole:'history', art:'UNA VISIÓN QUE EVOLUCIONA',image:'assets/espacios.jpg',imageAlt:'Espacio interior del archivo histórico de Multiservicios',caption:'De la experiencia de servicio a una plataforma tecnológica.'}
  ];
  let activeSlide = 0, paused = reduced.matches, hovered = false;
  const hero = $('.hero');
  function changeSlide(i, announce = true) {
    activeSlide = (i + slides.length) % slides.length;
    const s = slides[activeSlide];
    $('#hero-title').innerHTML = s.title;
    $('#hero-desc').textContent = s.desc;
    $('#hero-main').innerHTML = `${s.main} <span aria-hidden="true">↗</span>`;
    $('#hero-main').dataset.open = s.mainRole;
    $('#hero-alt').innerHTML = `${s.alt} <span aria-hidden="true">→</span>`;
    $('#hero-alt').dataset.open = s.altRole;
    $('.art-head > span').textContent = s.art;
    $('.art-index').textContent = `PT / A0${activeSlide + 1}`;
    $('.art-frame').dataset.state = String(activeSlide);
    $('.main-emblem').src=s.image;$('.main-emblem').alt=s.imageAlt;
    $('.art-caption').innerHTML='<span class="tiny-dot"></span>';$('.art-caption').append(document.createTextNode(s.caption));
    $('#slide-number').textContent = `0${activeSlide + 1}`;
    $$('.slide-dots button').forEach((b, idx) => {
      b.classList.toggle('active', idx === activeSlide);
      if (idx === activeSlide) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    const text = $('.slide-copy'); text.classList.remove('slide-change'); void text.offsetWidth; text.classList.add('slide-change');
    if (announce) $('#live-announcement').textContent = `Diapositiva ${activeSlide + 1} de 3: ${s.title.replace(/<[^>]+>/g, ' ')}`;
  }
  function updatePause() { const b=$('#pause-slide'); b.textContent = paused ? '▷' : 'Ⅱ'; b.setAttribute('aria-label', paused ? 'Reanudar carrusel' : 'Pausar carrusel'); b.setAttribute('aria-pressed', String(paused)); }
  updatePause();
  $('#pause-slide').addEventListener('click', () => {paused=!paused;updatePause();});
  $('#next-slide').addEventListener('click', () => changeSlide(activeSlide+1));
  $('#prev-slide').addEventListener('click', () => changeSlide(activeSlide-1));
  $$('.slide-dots button').forEach(b => b.addEventListener('click',()=>changeSlide(Number(b.dataset.slide))));
  hero.addEventListener('mouseenter',()=>hovered=true);hero.addEventListener('mouseleave',()=>hovered=false);
  const carouselTimer=setInterval(()=>{ if(!paused&&!hovered&&!document.hidden&&!$('#modal').open&&!hero.contains(document.activeElement))changeSlide(activeSlide+1,false);},8000);
  window.addEventListener('pagehide',()=>clearInterval(carouselTimer),{once:true});
  reduced.addEventListener('change',e=>{if(e.matches){paused=true;updatePause();}});

  const iconPaths = {
    air:'<path d="M3 5h18v9H3zM7 10h10M6 18v3m6-4v4m6-3v3"/>',
    electric:'<path d="m14 2-9 12h7l-2 8 9-12h-7l2-8Z"/>',
    water:'<path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13ZM9 16c0 2 1 3 3 3"/>',
    wood:'<path d="M3 6h18v14H3zM3 10h18M12 10v10M8 14h1m6 0h1M7 3v3m10-3v3"/>',
    paint:'<path d="M3 3h14v6H3zM17 5h4v8h-9v3M10 16h4v6h-4z"/>',
    glass:'<path d="M3 3h18v18H3zM12 3v18M3 12h18M6 8l3-3m6 13 3-3"/>',
    construction:'<path d="M3 21V8l9-5 9 5v13M1 21h22M7 9h3m4 0h3M7 13h3m4 0h3M10 21v-5h4v5"/>',
    clean:'<path d="m16 2-7 12M8 13l6 5-5 4-6-5 5-4ZM17 7v6m-3-3h6M4 3v4M2 5h4"/>',
    garden:'<path d="M12 21V10M12 16C3 16 3 8 3 8s9-1 9 8ZM12 11C12 2 21 2 21 2s1 9-9 9ZM6 22h12"/>',
    tech:'<path d="M3 4h18v13H3zM8 21h8m-4-4v4M8 8l-2 2 2 2m8-4 2 2-2 2"/>',
    design:'<path d="m4 17-1 4 4-1L20 7l-3-3L4 17ZM14 7l3 3M3 4h7M3 8h3M12 21h9"/>',
    service:'<path d="M5 9V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M3 9h18v12H3zM3 14h18M10 12h4v4h-4z"/>'
  };
  const services=[
    ['Aire acondicionado','Instalación, mantenimiento y atención técnica.','air','hogar negocios'],
    ['Electricidad','Instalaciones, revisión y mantenimiento eléctrico.','electric','hogar negocios'],
    ['Plomería','Agua, instalaciones y atención a fugas.','water','hogar negocios'],
    ['Carpintería','Mobiliario, ajustes y soluciones a medida.','wood','hogar'],
    ['Pintura y acabados','Conservación y renovación de espacios.','paint','hogar negocios'],
    ['Aluminio y vidrio','Cancelería, puertas y soluciones para espacios.','glass','hogar negocios'],
    ['Construcción y remodelación','Mejoras de obra y proyectos por especialidad.','construction','hogar negocios'],
    ['Limpieza y conservación','Atención de espacios residenciales y comerciales.','clean','hogar negocios'],
    ['Jardinería','Cuidado de áreas verdes y exteriores.','garden','hogar'],
    ['Soporte tecnológico','Equipos, conectividad y asistencia digital.','tech','digital negocios'],
    ['Diseño y contenido','Talento creativo y comunicación visual.','design','digital'],
    ['Servicios para negocios','Necesidades operativas y apoyo especializado.','service','negocios']
  ];
  $('#service-grid').innerHTML=services.map((s,i)=>`<button class="service-card" data-service="${i}" data-tags="${s[3]}" aria-label="Explorar ${s[0]}"><span class="service-top"><span class="service-icon"><svg aria-hidden="true" viewBox="0 0 24 24">${iconPaths[s[2]]}</svg></span><span class="num">${String(i+1).padStart(2,'0')}</span></span><h3>${s[0]}</h3><p>${s[1]}</p><span class="arrow" aria-hidden="true">↗</span></button>`).join('');
  let filter='all';
  const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function filterServices(){const query=normalize($('#service-search').value.trim());let count=0;$$('.service-card').forEach((c,i)=>{const show=(filter==='all'||c.dataset.tags.split(' ').includes(filter))&&normalize(services[i][0]+' '+services[i][1]).includes(query);c.hidden=!show;if(show)count++;});$('#no-results').hidden=count>0;$('#live-announcement').textContent=`${count} especialidades en la muestra.`;}
  $$('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;$$('[data-filter]').forEach(x=>{const a=x===b;x.classList.toggle('selected',a);x.setAttribute('aria-pressed',String(a));});filterServices();}));
  $('#service-search').addEventListener('input',filterServices);
  const journeys={client:[['Cuéntanos qué necesitas','Elige la especialidad, la zona aproximada y el alcance. Sin compartir documentos sensibles en el primer contacto.'],['Revisa las opciones','La plataforma buscará profesionales habilitados según especialidad y disponibilidad.'],['Acuerda y da seguimiento','Confirma el alcance antes de comenzar. El seguimiento, el cierre y el soporte deberán quedar integrados.']],professional:[['Presenta tu especialidad','Prepara tu perfil con lo que sabes hacer, tu zona y ejemplos autorizados de tu trabajo.'],['Completa la validación','El registro no habilita automáticamente: se revisarán identidad, especialidad y requisitos aplicables.'],['Ofrece tu servicio','Consulta solicitudes, acuerda el trabajo y documenta el resultado. La disponibilidad la define cada profesional.']]};
  let journeyRole='client';
  function setJourney(role){journeyRole=role;$$('[data-role]').forEach(b=>{const a=b.dataset.role===role;b.setAttribute('aria-selected',String(a));b.tabIndex=a?0:-1;});$('#steps').setAttribute('aria-labelledby',`tab-${role}`);$('#steps').innerHTML=journeys[role].map((s,i)=>`<div class="step"><span>0${i+1}</span><div><h3>${s[0]}</h3><p>${s[1]}</p></div></div>`).join('');$('#try-flow').dataset.open=role;}
  setJourney('client');
  $$('[data-role]').forEach(b=>{b.addEventListener('click',()=>setJourney(b.dataset.role));b.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const role=e.key==='Home'?'client':e.key==='End'?'professional':journeyRole==='client'?'professional':'client';setJourney(role);$(`#tab-${role}`).focus();}});});
  const nav=$('#navigation'),toggle=$('.menu-toggle');
  function closeNav(){nav.classList.remove('open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Abrir menú');}
  toggle.addEventListener('click',()=>{const open=!nav.classList.contains('open');nav.classList.toggle('open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Cerrar menú':'Abrir menú');});
  $$('a[href^="#"]').forEach(a=>a.addEventListener('click',closeNav));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeNav();});

  const modal=$('#modal'),body=$('#modal-body');let lastFocus=null,galleryIndex=0;
  function showModal(html){if(!modal.open)lastFocus=document.activeElement;body.innerHTML=html;if(!modal.open)modal.showModal();document.body.classList.add('modal-open');$('.close-modal').focus();}
  function closeModal(){modal.close();}
  $('.close-modal').addEventListener('click',closeModal);
  modal.addEventListener('close',()=>{document.body.classList.remove('modal-open');lastFocus?.focus?.();});
  modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
  const notice='<p class="preview-notice">PRUEBA DE RECORRIDO · Solo se prepara una ficha en esta ventana. No se envía, no se guarda en la plataforma y no se crea una cuenta.</p>';
  function showFlow(role,preselected=''){
    const pro=role==='professional';
    showModal(`<p class="modal-kicker">ADJUNTO / ${pro?'PROFESIONALES':'CLIENTES'}</p><h2 id="modal-title">${pro?'Dale espacio a tu especialidad.':'¿Qué necesitas resolver?'}</h2><p class="modal-intro">${pro?'Así podría comenzar tu perfil profesional. Usa datos de ejemplo; aquí no se solicita identificación, datos bancarios ni contacto.':'Prueba cómo organizaríamos tu solicitud. Usa una descripción de ejemplo, sin direcciones exactas ni información personal.'}</p>${notice}<form id="demo-form" data-kind="${role}"><div class="form-grid"><label>${pro?'Especialidad principal':'Servicio'}<select name="service" required><option value="">Selecciona una especialidad</option>${services.map(s=>`<option${s[0]===preselected?' selected':''}>${s[0]}</option>`).join('')}<option>Otra especialidad</option></select></label><label>Zona aproximada<select name="zone" required><option value="">Selecciona una zona</option><option>Cancún</option><option>Playa del Carmen</option><option>Tulum</option><option>Otra zona</option></select></label><label class="full">${pro?'¿Qué tipo de trabajos puedes ofrecer?':'¿En qué consiste el trabajo?'}<textarea name="description" minlength="12" maxlength="450" required placeholder="${pro?'Ejemplo: mantenimiento de minisplits y revisión de equipos.':'Ejemplo: mantenimiento preventivo de dos minisplits en una vivienda.'}"></textarea></label><label class="full">${pro?'Forma de trabajo':'Tipo de necesidad'}<select name="context"><option>${pro?'Profesional independiente':'Servicio puntual'}</option><option>${pro?'Equipo o empresa especializada':'Proyecto con varias especialidades'}</option></select></label></div><div class="form-buttons"><small>Las zonas y categorías son propuestas. La cobertura real está pendiente de validación.</small><button class="btn primary" type="submit">Ver ficha de ejemplo <span aria-hidden="true">→</span></button></div></form>`);
    $('#demo-form').addEventListener('submit',e=>{
      e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;
      const data=Object.fromEntries(new FormData(form));
      body.innerHTML=`<p class="modal-kicker">SIMULACIÓN COMPLETADA</p><h2 id="modal-title">Así se vería tu ficha.</h2><p class="modal-intro">${pro?'Este es un perfil de ejemplo, no un alta profesional.':'Este es un resumen de ejemplo, no una solicitud enviada.'}</p><div class="demo-result"><dl><dt>Especialidad</dt><dd id="result-service"></dd><dt>Zona aproximada</dt><dd id="result-zone"></dd><dt>${pro?'Oferta de trabajo':'Alcance'}</dt><dd id="result-desc"></dd><dt>Modalidad</dt><dd id="result-context"></dd></dl></div><p class="preview-notice">Siguiente etapa prevista: ${pro?'validación de identidad y requisitos antes de habilitar el perfil.':'consulta de disponibilidad y confirmación del alcance con el profesional.'} Esa integración no está conectada en esta muestra.</p><button class="btn primary" id="try-again">Probar otro ejemplo <span aria-hidden="true">↻</span></button>`;
      $('#result-service').textContent=data.service;$('#result-zone').textContent=data.zone;$('#result-desc').textContent=data.description;$('#result-context').textContent=data.context;
      $('#try-again').addEventListener('click',()=>showFlow(role));$('#modal-title').setAttribute('tabindex','-1');$('#modal-title').focus();
    });
  }
  const gallery=[['Aluminio y vidrio','Barandal mostrado en la propuesta de Multiservicios de 2018.','assets/trabajo-01.jpg'],['Acabados y cancelería','Cancel de baño del archivo visual de 2018.','assets/trabajo-02.jpg'],['Espacios comerciales','Fachada acristalada incluida en la propuesta histórica.','assets/trabajo-03.jpg'],['Cortinas y persianas','Persianas incluidas en la propuesta visual de 2018.','assets/trabajo-04.jpg']];
  function renderGallery(){const g=gallery[galleryIndex];body.innerHTML=`<p class="modal-kicker">GALERÍA / ARCHIVO VISUAL DE 2018</p><h2 id="modal-title">${g[0]}</h2><img class="dialog-image" src="${g[2]}" alt="${g[1]}"><p class="modal-intro">${g[1]} Esta fotografía no acredita un trabajo realizado por ADJUNTO. Debe confirmarse su autoría antes del lanzamiento comercial.</p><div class="gallery-controls"><button id="gallery-prev" aria-label="Foto anterior">← Anterior</button><span>${galleryIndex+1} / ${gallery.length}</span><button id="gallery-next" aria-label="Foto siguiente">Siguiente →</button></div>`;$('#gallery-prev').onclick=()=>{galleryIndex=(galleryIndex+gallery.length-1)%gallery.length;renderGallery();$('#gallery-prev').focus();};$('#gallery-next').onclick=()=>{galleryIndex=(galleryIndex+1)%gallery.length;renderGallery();$('#gallery-next').focus();};}
  const articles=[
    {title:'Una buena solicitud empieza antes de la cotización.',tag:'PARA CLIENTES',paragraphs:[['Primero, el problema.','Explica qué quieres resolver y qué está ocurriendo. “El aire no enfría” da un punto de partida distinto de “quiero instalar un equipo nuevo”.'],['Después, el alcance.','Indica cuántos equipos o espacios están involucrados y qué resultado esperas. Una fotografía útil puede ayudar, siempre que no exponga información personal.'],['La cotización necesita contexto.','Aclara la zona aproximada, el acceso al lugar y si hay restricciones de horario. Evita enviar documentos de identidad o información bancaria en el primer contacto.'],['La idea detrás de ADJUNTO.','Queremos que el primer contacto tenga más claridad. No decidir por el cliente ni por el profesional, sino ayudar a que ambos hablen del mismo trabajo antes de comprometerse.']]},
    {title:'Un perfil que explique qué sabes hacer.',tag:'PARA PROFESIONALES',paragraphs:[['Ser específico ayuda.','En lugar de “hago de todo”, describe las especialidades que puedes atender, los equipos con los que trabajas y los límites de lo que ofreces.'],['Muestra lo que sí es tuyo.','Selecciona ejemplos de trabajos propios y comparte imágenes con autorización. Explica qué hiciste y qué parte del resultado corresponde a tu intervención.'],['Deja claros tus límites.','Una zona de trabajo y una disponibilidad realista ayudan a evitar compromisos que no puedes sostener. No hace falta prometer cobertura ilimitada.'],['Un perfil no sustituye la validación.','El recorrido de ADJUNTO deberá comprobar los requisitos correspondientes antes de habilitar a un profesional. Un registro de datos, por sí solo, no es una aprobación.']]},
    {title:'Lo que cambia y lo que no: del oficio a ADJUNTO.',tag:'NUESTRA HISTORIA',paragraphs:[['Una visión que se adapta.','En 1998 comenzó la trayectoria de Heberto Mendoza. A lo largo de ese camino, Multiservicios fue creciendo alrededor de las necesidades de personas, hogares y negocios.'],['Un archivo que guarda una intención.','La propuesta web de 2018 ya reunía distintas divisiones, una galería, información del negocio y contacto. Su diseño mostraba la intención de comunicar capacidad, no solo enumerar oficios.'],['Otra forma de crecer.','Península Tech abre una nueva etapa con el desarrollo de ADJUNTO: una plataforma donde clientes y profesionales puedan encontrarse, sin que todas las especialidades tengan que formar parte de una misma plantilla laboral.'],['La calidad antes que el porcentaje.','La ambición es ampliar las posibilidades. Para que eso tenga sentido, una categoría deberá representar capacidad real de atención y un recorrido comprobado, no únicamente un nombre en un menú.']]}
  ];
  function showArticle(i){const a=articles[i];showModal(`<p class="modal-kicker">PERSPECTIVAS / ${a.tag}</p><h2 id="modal-title">${a.title}</h2><div class="article-body">${a.paragraphs.map(p=>`<h3>${p[0]}</h3><p>${p[1]}</p>`).join('')}</div><p class="preview-notice">Texto de propuesta para revisión de Heberto. No se presenta como artículo publicado ni como acreditación de capacidades actuales.</p>`);}
  const notes=`<p class="modal-kicker">PENÍNSULA TECH / ADJUNTO</p><h2 id="modal-title">Conoce la plataforma.</h2><p class="modal-intro">Esta web presenta la visión de Península Tech y dirige las acciones principales de clientes y profesionales hacia ADJUNTO.</p><ul class="notes-list"><li>ADJUNTO es la plataforma protagonista; Península Tech es la empresa detrás.</li><li>La web de MPH no fue reemplazada. Esta es una muestra independiente.</li><li>Las altas, solicitudes y operaciones se realizan en la plataforma ADJUNTO, no dentro de esta página corporativa.</li><li>Las fotografías de galería son archivo visual de 2018, no portafolio de ADJUNTO.</li><li>No se anuncian porcentajes de cobertura, tiempos garantizados, calificaciones ni profesionales ficticios.</li><li>Faltan contenido definitivo, medios autorizados y pruebas de integración antes del lanzamiento comercial.</li></ul><p class="preview-notice">Para iniciar una solicitud o registro profesional, utiliza los accesos a ADJUNTO disponibles en esta página.</p>`;
  $('#preview-info').onclick=()=>window.location.assign(PLATFORM_URL);$('#review-notes')?.addEventListener('click',()=>showModal(notes));
  $('#view-archive').onclick=()=>showModal('<p class="modal-kicker">DOCUMENTO RECUPERADO / AGOSTO DE 2018</p><h2 id="modal-title">La visión ya estaba ahí.</h2><p class="modal-intro">Vista del PDF “Pagina multiservicios”, conservado en el correo de Heberto. Contiene texto de relleno y referencias de diseño: es una maqueta histórica, no una copia funcional del sitio.</p><img class="history-full" src="assets/maqueta-completa-2018.webp" alt="Maqueta histórica completa de Multiservicios de Cancún de 2018">');
  document.addEventListener('click',e=>{const open=e.target.closest('[data-open]');if(open){const r=open.dataset.open;if(r==='catalogue')$('#servicios').scrollIntoView({behavior:reduced.matches?'auto':'smooth'});else if(r==='history')$('#somos').scrollIntoView({behavior:reduced.matches?'auto':'smooth'});else if(r==='client'||r==='professional')window.location.assign(PLATFORM_URL);return;}const s=e.target.closest('[data-service]');if(s){window.location.assign(PLATFORM_URL);return;}const g=e.target.closest('[data-gallery]');if(g){galleryIndex=Number(g.dataset.gallery);showModal('');renderGallery();return;}const a=e.target.closest('[data-article]');if(a)showArticle(Number(a.dataset.article));});
})();
