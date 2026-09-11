require('dotenv').config();

const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const app = express();
const db = new Database(path.join(__dirname, 'database.db'));
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'billcuts';
const ADMIN_SESSIONS = new Set();

app.set('trust proxy', 1);

function getCookie(req, name) {
  const value = req.headers.cookie || '';
  const match = value.split(';').find((item) => item.trim().startsWith(`${name}=`));
  return match ? decodeURIComponent(match.trim().split('=')[1]) : null;
}

function requireAdmin(req, res, next) {
  const token = getCookie(req, 'session');
  if (token && ADMIN_SESSIONS.has(token)) {
    return next();
  }

  return res.status(401).json({ error: 'Não autenticado.' });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const EXPEDIENTE = {
  0: null,
  1: { inicio: '08:00', fim: '20:00' },
  2: { inicio: '08:00', fim: '20:00' },
  3: { inicio: '08:00', fim: '20:00' },
  4: { inicio: '08:00', fim: '20:00' },
  5: { inicio: '08:00', fim: '20:00' },
  6: { inicio: '08:00', fim: '16:00' },
};

function timeToMinutes(value) {
  const [hora, minuto = '0'] = String(value || '00:00').split(':');
  return Number(hora) * 60 + Number(minuto);
}

function getDayOfWeek(dateString) {
  const [ano, mes, dia] = String(dateString || '').split('-').map(Number);
  if (!ano || !mes || !dia) return null;
  const data = new Date(ano, mes - 1, dia);
  return data.getDay();
}

function validarExpediente(data, hora, duracaoMinutos = 0) {
  const diaSemana = getDayOfWeek(data);
  const expediente = EXPEDIENTE[diaSemana];

  if (!expediente) {
    return { ok: false, error: 'A barbearia fica fechada aos domingos.' };
  }

  const inicioMinutos = timeToMinutes(expediente.inicio);
  const fimMinutos = timeToMinutes(expediente.fim);
  const horarioMinutos = timeToMinutes(hora);
  const duracao = Number(duracaoMinutos || 0);
  const fimAgendamento = horarioMinutos + duracao;

  if (horarioMinutos % 30 !== 0) {
    return { ok: false, error: 'Escolha um horário redondo, sempre de 30 em 30 minutos.' };
  }

  if (horarioMinutos < inicioMinutos || horarioMinutos >= fimMinutos) {
    return {
      ok: false,
      error: `Horário fora do expediente. A barbearia atende de ${expediente.inicio} às ${expediente.fim}.`,
    };
  }

  if (duracao > 0 && fimAgendamento > fimMinutos) {
    return {
      ok: false,
      error: `Esse serviço ultrapassa o fechamento da barbearia. Escolha um horário até ${expediente.fim}.`,
    };
  }

  return { ok: true };
}

const createTables = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT,
      whatsapp TEXT,
      email TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS servicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      duracao_minutos INTEGER NOT NULL,
      preco REAL NOT NULL,
      ativo INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      servico_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      hora TEXT NOT NULL,
      observacoes TEXT,
      status TEXT NOT NULL DEFAULT 'pendente',
      motivo_cancelamento TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (servico_id) REFERENCES servicos(id)
    );

    CREATE TABLE IF NOT EXISTS historico_agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agendamento_id INTEGER NOT NULL,
      status_anterior TEXT,
      status_novo TEXT NOT NULL,
      motivo TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id)
    );

    CREATE TABLE IF NOT EXISTS agendamento_servicos (
      agendamento_id INTEGER NOT NULL,
      servico_id INTEGER NOT NULL,
      PRIMARY KEY (agendamento_id, servico_id),
      FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id),
      FOREIGN KEY (servico_id) REFERENCES servicos(id)
    );
  `);

  db.exec(`
    INSERT OR IGNORE INTO agendamento_servicos (agendamento_id, servico_id)
    SELECT id, servico_id FROM agendamentos;
  `);

  const servicos = db.prepare('SELECT COUNT(*) AS total FROM servicos').get();
  if (servicos.total === 0) {
    db.prepare(`
      INSERT INTO servicos (nome, duracao_minutos, preco, ativo)
      VALUES
        ('Corte Masculino', 40, 45.00, 1),
        ('Barba Completa', 30, 35.00, 1),
        ('Corte + Barba', 70, 70.00, 1),
        ('Sobrancelha', 15, 15.00, 1),
        ('Corte Navalhado', 45, 55.00, 1),
        ('Pigmentação', 30, 40.00, 1),
        ('Corte Infantil', 30, 35.00, 1),
        ('Platinado / Coloração', 90, 120.00, 1)
    `).run();
  }
};

createTables();

app.get('/api/servicos', (req, res) => {
  const servicos = db.prepare('SELECT * FROM servicos WHERE ativo = 1 ORDER BY id').all();
  res.json(servicos);
});

app.get('/api/session', (req, res) => {
  const token = getCookie(req, 'session');
  res.json({ authenticated: Boolean(token && ADMIN_SESSIONS.has(token)) });
});

app.get('/login.html', (req, res) => {
  const token = getCookie(req, 'session');
  if (token && ADMIN_SESSIONS.has(token)) {
    return res.redirect('/admin');
  }
  return res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/admin', (req, res) => {
  const token = getCookie(req, 'session');
  if (!token || !ADMIN_SESSIONS.has(token)) {
    return res.redirect('/login.html');
  }
  return res.sendFile(path.join(__dirname, 'admin-profissional.html'));
});

app.get('/admin-profissional.html', (req, res) => {
  const token = getCookie(req, 'session');
  if (!token || !ADMIN_SESSIONS.has(token)) {
    return res.redirect('/login.html');
  }
  return res.sendFile(path.join(__dirname, 'admin-profissional.html'));
});

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Senha inválida.' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  ADMIN_SESSIONS.add(token);

  const cookieOptions = ['Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (NODE_ENV === 'production') cookieOptions.push('Secure');

  res.setHeader('Set-Cookie', `session=${token}; ${cookieOptions.join('; ')}`);
  return res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  const token = getCookie(req, 'session');
  if (token) {
    ADMIN_SESSIONS.delete(token);
  }

  const cookieOptions = ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (NODE_ENV === 'production') cookieOptions.push('Secure');

  res.setHeader('Set-Cookie', `session=; ${cookieOptions.join('; ')}`);
  res.json({ ok: true });
});

app.get('/api/agendamentos', requireAdmin, (req, res) => {
  const search = (req.query.search || '').trim();
  const status = (req.query.status || '').trim();

  let sql = `
    SELECT a.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
      COALESCE((
        SELECT GROUP_CONCAT(servicos.nome, ', ')
        FROM agendamento_servicos
        JOIN servicos ON servicos.id = agendamento_servicos.servico_id
        WHERE agendamento_servicos.agendamento_id = a.id
      ), s.nome) AS servico_nome,
      COALESCE((
        SELECT SUM(servicos.preco)
        FROM agendamento_servicos
        JOIN servicos ON servicos.id = agendamento_servicos.servico_id
        WHERE agendamento_servicos.agendamento_id = a.id
      ), s.preco) AS servico_preco
    FROM agendamentos a
    JOIN clientes c ON c.id = a.cliente_id
    JOIN servicos s ON s.id = a.servico_id
    WHERE 1 = 1
  `;
  const params = [];

  if (search) {
    sql += ` AND (c.nome LIKE ? OR c.telefone LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  if (status) {
    sql += ` AND a.status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY a.data ASC, a.hora ASC`;

  const agendamentos = db.prepare(sql).all(...params);
  res.json(agendamentos);
});

app.get('/api/disponibilidade', (req, res) => {
  const { data } = req.query;
  if (!data) return res.status(400).json({ error: 'Data obrigatória.' });

  const agendamentos = db.prepare(`
    SELECT a.hora,
      COALESCE(SUM(servicos.duracao_minutos), s.duracao_minutos) AS duracao_minutos
    FROM agendamentos a
    JOIN servicos s ON s.id = a.servico_id
    LEFT JOIN agendamento_servicos vinculos ON vinculos.agendamento_id = a.id
    LEFT JOIN servicos ON servicos.id = vinculos.servico_id
    WHERE a.data = ? AND a.status != 'cancelado'
    GROUP BY a.id
    ORDER BY a.hora
  `).all(data);

  res.json({
    ocupados: agendamentos.map((item) => ({
      inicio: timeToMinutes(item.hora),
      fim: timeToMinutes(item.hora) + Number(item.duracao_minutos || 0),
    })),
  });
});

app.post('/api/agendamentos', (req, res) => {
  const { nome, telefone, data, hora, obs } = req.body || {};
  const servicoIds = Array.isArray(req.body?.servicos)
    ? req.body.servicos.map(Number).filter(Boolean)
    : [Number(req.body?.servico)].filter(Boolean);

  if (!nome || !telefone || !servicoIds.length || !data || !hora) {
    return res.status(400).json({ error: 'Dados obrigatórios faltando.' });
  }

  const servicoItems = servicoIds.map((id) => db.prepare('SELECT * FROM servicos WHERE id = ? AND ativo = 1').get(id));
  if (servicoItems.some((item) => !item)) {
    return res.status(400).json({ error: 'Serviço inválido.' });
  }

  const servicoItem = servicoItems[0];
  const duracaoTotal = servicoItems.reduce((total, item) => total + Number(item.duracao_minutos || 0), 0);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataSelecionada = new Date(`${data}T00:00:00`);
  if (dataSelecionada < hoje) {
    return res.status(400).json({ error: 'Não é possível agendar para uma data passada.' });
  }

  const expediente = validarExpediente(data, hora, duracaoTotal);
  if (!expediente.ok) {
    return res.status(400).json({ error: expediente.error });
  }

  const horarioNovoInicio = timeToMinutes(hora);
  const horarioNovoFim = horarioNovoInicio + duracaoTotal;
  const horariosExistentes = db.prepare(`
    SELECT a.hora,
      COALESCE(SUM(servicos.duracao_minutos), s.duracao_minutos) AS duracao_minutos
    FROM agendamentos a
    JOIN servicos s ON s.id = a.servico_id
    LEFT JOIN agendamento_servicos vinculos ON vinculos.agendamento_id = a.id
    LEFT JOIN servicos ON servicos.id = vinculos.servico_id
    WHERE a.data = ? AND a.status != 'cancelado'
    GROUP BY a.id
  `).all(data);

  const horarioOcupado = horariosExistentes.some((item) => {
    const inicio = timeToMinutes(item.hora);
    const fim = inicio + Number(item.duracao_minutos || 0);
    return horarioNovoInicio < fim && horarioNovoFim > inicio;
  });

  if (horarioOcupado) {
    return res.status(409).json({ error: 'Este horário já está ocupado.' });
  }

  const existingCliente = db.prepare('SELECT * FROM clientes WHERE telefone = ? OR whatsapp = ?').get(telefone, telefone);

  const clienteId = existingCliente
    ? existingCliente.id
    : db.prepare('INSERT INTO clientes (nome, telefone, whatsapp) VALUES (?, ?, ?)').run(nome, telefone, telefone).lastInsertRowid;

  const insert = db.prepare(`
    INSERT INTO agendamentos (cliente_id, servico_id, data, hora, observacoes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pendente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  const result = insert.run(clienteId, servicoItem.id, data, hora, obs || '');

  const vincularServicos = db.prepare('INSERT INTO agendamento_servicos (agendamento_id, servico_id) VALUES (?, ?)');
  const salvarServicos = db.transaction(() => {
    servicoIds.forEach((servicoId) => vincularServicos.run(result.lastInsertRowid, servicoId));
  });
  salvarServicos();

  db.prepare(`
    INSERT INTO historico_agendamentos (agendamento_id, status_anterior, status_novo, motivo, created_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(result.lastInsertRowid, null, 'pendente', 'Agendamento criado');

  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

app.delete('/api/agendamentos', requireAdmin, (req, res) => {
  if (req.body?.confirmacao !== 'ZERAR') {
    return res.status(400).json({ error: 'Confirmação inválida.' });
  }

  const limparAgendamentos = db.transaction(() => {
    db.prepare('DELETE FROM historico_agendamentos').run();
    db.prepare('DELETE FROM agendamento_servicos').run();
    return db.prepare('DELETE FROM agendamentos').run().changes;
  });

  const total = limparAgendamentos();
  res.json({ ok: true, total });
});

app.patch('/api/agendamentos/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { nome, telefone, servico, data, hora, observacoes, status, motivo } = req.body || {};

  const agendamento = db.prepare('SELECT * FROM agendamentos WHERE id = ?').get(Number(id));
  if (!agendamento) {
    return res.status(404).json({ error: 'Agendamento não encontrado.' });
  }

  const servicoId = Number(servico || agendamento.servico_id);
  const servicoItem = db.prepare('SELECT * FROM servicos WHERE id = ?').get(servicoId);
  if (!servicoItem) {
    return res.status(400).json({ error: 'Serviço inválido.' });
  }

  const novaData = data || agendamento.data;
  const novaHora = hora || agendamento.hora;
  const expediente = validarExpediente(novaData, novaHora, Number(servicoItem.duracao_minutos || 0));
  if (!expediente.ok) {
    return res.status(400).json({ error: expediente.error });
  }

  const conflito = db.prepare(`
    SELECT id FROM agendamentos
    WHERE data = ? AND hora = ? AND status != 'cancelado' AND id != ?
  `).get(novaData, novaHora, Number(id));

  if (conflito) {
    return res.status(409).json({ error: 'Este horário já está ocupado.' });
  }

  const proximoStatus = status || agendamento.status;
  const prevStatus = agendamento.status;

  db.prepare('UPDATE clientes SET nome = ?, telefone = ?, whatsapp = ? WHERE id = ?').run(
    nome || '',
    telefone || '',
    telefone || '',
    agendamento.cliente_id
  );

  db.prepare(`
    UPDATE agendamentos
    SET servico_id = ?, data = ?, hora = ?, observacoes = ?, status = ?, motivo_cancelamento = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(servicoId, novaData, novaHora, observacoes || '', proximoStatus, proximoStatus === 'cancelado' ? (motivo || 'Sem motivo informado') : null, Number(id));

  db.prepare(`
    INSERT INTO historico_agendamentos (agendamento_id, status_anterior, status_novo, motivo, created_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(Number(id), prevStatus, proximoStatus, motivo || null);

  res.json({ ok: true });
});

app.patch('/api/agendamentos/:id/status', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status, motivo } = req.body || {};

  const agendamento = db.prepare('SELECT * FROM agendamentos WHERE id = ?').get(Number(id));
  if (!agendamento) {
    return res.status(404).json({ error: 'Agendamento não encontrado.' });
  }

  const statusAtual = agendamento.status;
  db.prepare(`
    UPDATE agendamentos
    SET status = ?, motivo_cancelamento = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, status === 'cancelado' ? (motivo || 'Sem motivo informado') : null, Number(id));

  db.prepare(`
    INSERT INTO historico_agendamentos (agendamento_id, status_anterior, status_novo, motivo, created_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(Number(id), statusAtual, status, motivo || null);

  res.json({ ok: true });
});

app.get('/api/relatorio', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS total FROM agendamentos').get();
  const pendentes = db.prepare("SELECT COUNT(*) AS total FROM agendamentos WHERE status = 'pendente'").get();
  const confirmados = db.prepare("SELECT COUNT(*) AS total FROM agendamentos WHERE status = 'confirmado'").get();
  const cancelados = db.prepare("SELECT COUNT(*) AS total FROM agendamentos WHERE status = 'cancelado'").get();
  const faturamento = db.prepare(`
    SELECT COALESCE(SUM(servicos.preco), 0) AS total
    FROM agendamentos a
    JOIN agendamento_servicos ON agendamento_servicos.agendamento_id = a.id
    JOIN servicos ON servicos.id = agendamento_servicos.servico_id
    WHERE a.status = 'confirmado'
  `).get();

  res.json({
    total: total.total,
    pendentes: pendentes.total,
    confirmados: confirmados.total,
    cancelados: cancelados.total,
    faturamento: Number(faturamento.total || 0),
  });
});

app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
