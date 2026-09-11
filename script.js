// ==========================================================================
// NÚMERO DE WHATSAPP DA BARBEARIA
// Formato: código do país (55) + DDD (11) + número, sem espaços ou símbolos.
// ==========================================================================
const WHATSAPP_NUMBER = '5511933679420';
const STORAGE_KEY = 'billcuts_agendamentos';

function lerAgendamentos() {
  try {
    const dados = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(dados) ? dados : [];
  } catch {
    return [];
  }
}

function salvarAgendamentos(agendamentos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(agendamentos));
}

async function salvarAgendamentoNoBanco(dados) {
  const response = await fetch('/api/agendamentos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nome: dados.nome,
      telefone: dados.telefone,
      servicos: dados.servicoIds,
      data: dados.data,
      hora: dados.hora,
      obs: dados.obs,
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || 'Não foi possível salvar o agendamento.');
  }

  return result;
}

// ==========================================================================
// 1) MENU MOBILE
// Alterna a classe "is-open" no botão e na navegação. O CSS cuida do resto.
// ==========================================================================
const menuBtn = document.getElementById('menuBtn');
const nav = document.getElementById('nav');

if (menuBtn && nav) {
  menuBtn.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    menuBtn.classList.toggle('is-open', isOpen);
    menuBtn.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      menuBtn.classList.remove('is-open');
      menuBtn.setAttribute('aria-expanded', 'false');
    });
  });
}

// ==========================================================================
// 2) CABEÇALHO — leve sombra extra quando a página é rolada
// ==========================================================================
const header = document.getElementById('header');
if (header) {
  window.addEventListener('scroll', () => {
    header.style.boxShadow = window.scrollY > 10 ? '0 4px 16px rgba(0,0,0,0.4)' : 'none';
  });
}

// ==========================================================================
// 3) FORMULÁRIO DE AGENDAMENTO → WHATSAPP
// Em vez de enviar para um servidor (o que exigiria backend), montamos uma
// mensagem de texto pronta e abrimos o WhatsApp Web/App já com ela escrita.
// É o jeito padrão de pequenos negócios no Brasil receberem agendamentos.
// ==========================================================================
const form = document.getElementById('bookingForm');
const formNote = document.getElementById('formNote');
const dataInput = document.getElementById('data');
const horaInput = document.getElementById('hora');
const datePicker = document.getElementById('datePicker');
const timePicker = document.getElementById('timePicker');
const serviceOptions = Array.from(document.querySelectorAll('[data-service-option]'));
const selectionCount = document.getElementById('selectionCount');
const telefoneInput = document.getElementById('telefone');
let disponibilidadeRequestId = 0;

const EXPEDIENTE = {
  0: null,
  1: { inicio: '08:00', fim: '20:00' },
  2: { inicio: '08:00', fim: '20:00' },
  3: { inicio: '08:00', fim: '20:00' },
  4: { inicio: '08:00', fim: '20:00' },
  5: { inicio: '08:00', fim: '20:00' },
  6: { inicio: '08:00', fim: '16:00' },
};

function formatarDataBR(isoDate) {
  if (!isoDate) return '';
  const [ano, mes, dia] = isoDate.split('-');
  return `${dia}/${mes}/${ano}`;
}

function timeToMinutes(value) {
  const [hora, minuto = '0'] = String(value || '00:00').split(':');
  return Number(hora) * 60 + Number(minuto);
}

function getDayOfWeek(dateString) {
  const [ano, mes, dia] = String(dateString || '').split('-').map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia).getDay();
}

function minutosParaHora(totalMinutos) {
  const hora = Math.floor(totalMinutos / 60).toString().padStart(2, '0');
  const minuto = (totalMinutos % 60).toString().padStart(2, '0');
  return `${hora}:${minuto}`;
}

function getDuracaoSelecionada() {
  const duracoes = [40, 30, 70, 15, 45, 30, 30, 90];
  return serviceOptions.filter((option) => option.checked).reduce(
    (total, option) => total + (duracoes[Number(option.value) - 1] || 0),
    0
  );
}

function getServicosSelecionados() {
  return serviceOptions.filter((option) => option.checked);
}

function atualizarContagemServicos() {
  if (!selectionCount) return;
  const total = getServicosSelecionados().length;
  selectionCount.textContent = `${total} ${total === 1 ? 'selecionado' : 'selecionados'}`;
}

function formatarTelefone(value) {
  const numeros = value.replace(/\D/g, '').slice(0, 11);
  if (numeros.length <= 2) return numeros.length ? `(${numeros}` : '';
  if (numeros.length <= 7) return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
  return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
}

function preencherDatasDisponiveis() {
  if (!dataInput || !datePicker) return;

  const dataAtual = dataInput.value;
  datePicker.innerHTML = '';

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'
  });

  for (let indice = 0; indice < 90; indice += 1) {
    const data = new Date(hoje);
    data.setDate(hoje.getDate() + indice);
    const iso = [data.getFullYear(), String(data.getMonth() + 1).padStart(2, '0'), String(data.getDate()).padStart(2, '0')].join('-');

    if (!EXPEDIENTE[data.getDay()]) continue;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button date-choice';
    button.dataset.value = iso;
    button.innerHTML = `<strong>${formatter.format(data).split(',')[0]}</strong><small>${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}</small>`;
    button.addEventListener('click', () => {
      dataInput.value = iso;
      datePicker.querySelectorAll('.choice-button').forEach((item) => item.classList.remove('is-selected'));
      button.classList.add('is-selected');
      atualizarHorarioDisponivel();
    });
    datePicker.appendChild(button);
  }

  if (dataAtual && datePicker.querySelector(`[data-value="${dataAtual}"]`)) {
    dataInput.value = dataAtual;
    datePicker.querySelector(`[data-value="${dataAtual}"]`).classList.add('is-selected');
  } else {
    dataInput.value = '';
  }
  datePicker.classList.toggle('is-disabled', !getDuracaoSelecionada());
  if (!getDuracaoSelecionada()) dataInput.value = '';
}

async function atualizarHorarioDisponivel() {
  if (!dataInput || !horaInput || !timePicker) return;

  const dataSelecionada = dataInput.value;
  const expediente = EXPEDIENTE[getDayOfWeek(dataSelecionada)];
  const duracao = getDuracaoSelecionada();
  const valorAtual = horaInput.value;
  const requestId = ++disponibilidadeRequestId;

  timePicker.innerHTML = '';
  horaInput.value = '';

  if (!dataSelecionada || !expediente || !duracao) {
    timePicker.classList.add('is-disabled');
    const empty = document.createElement('div');
    empty.className = 'choice-empty';
    empty.textContent = !duracao ? 'Escolha os serviços primeiro.' : 'Escolha uma data para ver os horários.';
    timePicker.appendChild(empty);
    return;
  }

  const inicio = timeToMinutes(expediente.inicio);
  const fim = timeToMinutes(expediente.fim);
  const ultimoHorario = Math.floor((fim - duracao) / 30) * 30;

  let ocupados = [];
  try {
    const response = await fetch(`/api/disponibilidade?data=${encodeURIComponent(dataSelecionada)}`);
    const disponibilidade = await response.json();
    if (requestId !== disponibilidadeRequestId) return;
    ocupados = disponibilidade.ocupados || [];
  } catch {
    const empty = document.createElement('div');
    empty.className = 'choice-empty';
    empty.textContent = 'Não foi possível carregar os horários. Tente novamente.';
    timePicker.appendChild(empty);
    timePicker.classList.add('is-disabled');
    return;
  }

  for (let minutos = inicio; minutos <= ultimoHorario; minutos += 30) {
    const fimDoHorario = minutos + duracao;
    const indisponivel = ocupados.some((ocupado) => minutos < ocupado.fim && fimDoHorario > ocupado.inicio);
    if (indisponivel) continue;

    const horario = minutosParaHora(minutos);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button time-choice';
    button.dataset.value = horario;
    button.textContent = horario;
    button.addEventListener('click', () => {
      horaInput.value = horario;
      timePicker.querySelectorAll('.choice-button').forEach((item) => item.classList.remove('is-selected'));
      button.classList.add('is-selected');
    });
    timePicker.appendChild(button);
  }

  timePicker.classList.remove('is-disabled');
  if (valorAtual && timePicker.querySelector(`[data-value="${valorAtual}"]`)) {
    horaInput.value = valorAtual;
    timePicker.querySelector(`[data-value="${valorAtual}"]`).classList.add('is-selected');
  }
}

function isHorarioValido(dateString, timeString, durationMinutes = 0) {
  const diaSemana = getDayOfWeek(dateString);
  const expediente = EXPEDIENTE[diaSemana];

  if (!expediente) {
    return { ok: false, message: 'A barbearia fica fechada aos domingos.' };
  }

  const inicioMinutos = timeToMinutes(expediente.inicio);
  const fimMinutos = timeToMinutes(expediente.fim);
  const horarioMinutos = timeToMinutes(timeString);
  const fimAgendamento = horarioMinutos + Number(durationMinutes || 0);

  if (horarioMinutos % 30 !== 0) {
    return { ok: false, message: 'Escolha um horário redondo, sempre de 30 em 30 minutos.' };
  }

  if (horarioMinutos < inicioMinutos || horarioMinutos >= fimMinutos) {
    return { ok: false, message: `Horário fora do expediente. Atendimento de ${String(Math.floor(inicioMinutos / 60)).padStart(2, '0')}:00 às ${String(Math.floor(fimMinutos / 60)).padStart(2, '0')}:00.` };
  }

  if (durationMinutes > 0 && fimAgendamento > fimMinutos) {
    return { ok: false, message: `Esse serviço ultrapassa o fechamento da barbearia. Escolha um horário até ${String(Math.floor(fimMinutos / 60)).padStart(2, '0')}:00.` };
  }

  return { ok: true };
}

function montarMensagemWhatsApp(dados) {
  const texto = [
    'Olá! Quero agendar um horário no Bill Cuts.',
    '',
    `*Nome:* ${dados.nome}`,
    `*Telefone:* ${dados.telefone}`,
    `*Serviço:* ${dados.servico}`,
    `*Data:* ${dados.data}`,
    `*Horário:* ${dados.hora}`,
    dados.obs ? `*Observações:* ${dados.obs}` : '',
  ].filter(Boolean).join('%0A');

  return encodeURIComponent(texto);
}

if (form && formNote) {
  if (telefoneInput) {
    telefoneInput.addEventListener('input', () => {
      telefoneInput.value = formatarTelefone(telefoneInput.value);
      telefoneInput.setCustomValidity(
        telefoneInput.value.replace(/\D/g, '').length === 11 ? '' : 'Digite um WhatsApp válido com DDD.'
      );
    });
  }

  serviceOptions.forEach((option) => {
    option.addEventListener('change', () => {
      atualizarContagemServicos();
      preencherDatasDisponiveis();
      atualizarHorarioDisponivel();
    });
  });

  atualizarContagemServicos();
  preencherDatasDisponiveis();
  atualizarHorarioDisponivel();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      formNote.textContent = 'Preenche os campos obrigatórios antes de enviar, por favor.';
      formNote.classList.add('is-error');
      form.reportValidity();
      return;
    }

    const dados = {
      nome: form.nome.value.trim(),
      telefone: form.telefone.value.trim(),
      servicos: getServicosSelecionados(),
      servicoIds: getServicosSelecionados().map((option) => option.value),
      servico: getServicosSelecionados().map((option) => `${option.dataset.label} — ${option.dataset.price}`).join(', '),
      data: form.data.value,
      hora: form.hora.value,
      obs: form.obs.value.trim(),
    };

    if (!dados.servicoIds.length) {
      formNote.textContent = 'Selecione um serviço antes de enviar.';
      formNote.classList.add('is-error');
      return;
    }

    if (!dados.data || !dados.hora) {
      formNote.textContent = 'Escolha uma data e um horário disponíveis.';
      formNote.classList.add('is-error');
      return;
    }

    const duracaoDoServico = getDuracaoSelecionada();
    const validacao = isHorarioValido(dados.data, dados.hora, duracaoDoServico);

    if (!validacao.ok) {
      formNote.textContent = validacao.message;
      formNote.classList.add('is-error');
      return;
    }

    let agendamentoSalvo;
    try {
      agendamentoSalvo = await salvarAgendamentoNoBanco(dados);
    } catch (error) {
      formNote.textContent = error.message;
      formNote.classList.add('is-error');
      return;
    }

    const mensagem = montarMensagemWhatsApp({
      nome: dados.nome,
      telefone: dados.telefone,
      servico: dados.servico,
      data: formatarDataBR(dados.data),
      hora: dados.hora,
      obs: dados.obs,
    });
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${mensagem}`;
    window.open(url, '_blank');

    formNote.textContent = `Prontinho! Agendamento #${agendamentoSalvo.id} salvo e WhatsApp aberto.`;
    formNote.classList.remove('is-error');
    form.reset();
    atualizarContagemServicos();
    if (dataInput) {
      preencherDatasDisponiveis();
      atualizarHorarioDisponivel();
    }
  });
}

// ==========================================================================
// 4) ANIMAÇÃO DE ENTRADA AO ROLAR A PÁGINA
// IntersectionObserver avisa quando um elemento entra na tela — muito mais
// leve que ficar checando a posição do scroll manualmente.
// ==========================================================================
const revealTargets = document.querySelectorAll(
  '.section-head, .price-tag, .sobre-text, .info-list, .map-frame, .form'
);

if ('IntersectionObserver' in window) {
  revealTargets.forEach((el) => el.classList.add('reveal'));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  revealTargets.forEach((el) => observer.observe(el));
} else {
  revealTargets.forEach((el) => el.classList.add('is-visible'));
}

// ==========================================================================
// 5) ANO ATUAL NO RODAPÉ (evita ficar desatualizado)
// ==========================================================================
const yearNode = document.getElementById('year');
if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

// ==========================================================================
// 6) DATA MÍNIMA NO CAMPO "DATA PREFERIDA" = HOJE
// Impede o cliente de tentar agendar para uma data que já passou.
// ==========================================================================
if (dataInput) {
  dataInput.min = new Date().toISOString().split('T')[0];
}

const adminLoginModal = document.getElementById('adminLoginModal');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminLoginError = document.getElementById('adminLoginError');
const adminLoginOpeners = document.querySelectorAll('[data-admin-login]');
const adminLoginCloser = document.querySelector('[data-close-admin-modal]');

function openAdminLoginModal() {
  if (!adminLoginModal) return;
  adminLoginModal.classList.add('is-open');
  adminLoginModal.setAttribute('aria-hidden', 'false');
  const input = document.getElementById('adminPassword');
  if (input) {
    setTimeout(() => input.focus(), 50);
  }
}

function closeAdminLoginModal() {
  if (!adminLoginModal) return;
  adminLoginModal.classList.remove('is-open');
  adminLoginModal.setAttribute('aria-hidden', 'true');
  if (adminLoginError) adminLoginError.textContent = '';
}

adminLoginOpeners.forEach((button) => {
  button.addEventListener('click', openAdminLoginModal);
});

if (adminLoginCloser) {
  adminLoginCloser.addEventListener('click', closeAdminLoginModal);
}

if (adminLoginModal) {
  adminLoginModal.addEventListener('click', (event) => {
    if (event.target === adminLoginModal) closeAdminLoginModal();
  });
}

if (adminLoginForm) {
  adminLoginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const password = document.getElementById('adminPassword')?.value || '';

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await response.json();

      if (!response.ok) {
        if (adminLoginError) {
          if (response.status === 404 || window.location.protocol === 'file:') {
            adminLoginError.textContent = 'Abra o sistema em http://localhost:3000 antes de entrar no painel.';
            return;
          }

          adminLoginError.textContent = data.error || 'Senha inválida.';
        }
        return;
      }

      window.location.href = '/admin-profissional.html';
    } catch (error) {
      if (adminLoginError) {
        if (window.location.protocol === 'file:') {
          adminLoginError.textContent = 'Abra o sistema em http://localhost:3000 antes de entrar no painel.';
          return;
        }

        adminLoginError.textContent = 'Não foi possível entrar no painel. Verifique se o servidor está rodando.';
      }
    }
  });
}
