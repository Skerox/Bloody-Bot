require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, PermissionsBitField } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

const RUTA_ARCHIVO = './registro.json';
const mensajesEmbedEntrada = new Map();

function guardarRegistro(usuarioId, tipo, username) {
  let registros = {};
  if (fs.existsSync(RUTA_ARCHIVO)) {
    registros = JSON.parse(fs.readFileSync(RUTA_ARCHIVO));
  }

  if (!registros[usuarioId]) {
    registros[usuarioId] = [];
  }

  registros[usuarioId].push({
    tipo,
    fecha: new Date().toISOString(),
    username
  });

  fs.writeFileSync(RUTA_ARCHIVO, JSON.stringify(registros, null, 2));
}

function calcularHoras(registros) {
  let totalMinutos = 0;
  const entradas = registros.filter(r => r.tipo === 'entrada');
  const salidas = registros.filter(r => r.tipo === 'salida');

  for (let i = 0; i < Math.min(entradas.length, salidas.length); i++) {
    const entrada = new Date(entradas[i].fecha);
    const salida = new Date(salidas[i].fecha);
    totalMinutos += (salida - entrada) / 60000;
  }

  return (totalMinutos / 60).toFixed(2);
}

function filtrarPorRango(registros, dias) {
  const ahora = new Date();
  const desde = new Date(ahora);
  desde.setDate(ahora.getDate() - dias);

  return registros.filter(r => {
    const fecha = new Date(r.fecha);
    return fecha >= desde && fecha <= ahora;
  });
}

client.once('ready', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);

  const canalId = '1391621809950035968';
  const canal = await client.channels.fetch(canalId);

  if (canal) {
    const panelEmbed = new EmbedBuilder()
      .setTitle('📢 Sistema de Registro de Horarios')
      .setDescription('Este es el nuevo sistema de horarios.\nMarca tu horario usando los botones de abajo:\n\n🟢 **Entrar en servicio**\n🔴 **Salir de servicio**\n\n📊 Usa `!resumen dia`, `!resumen semana` o `!resumen mes` para ver tus horas.')
      .setImage('https://i.postimg.cc/PfmP2s2F/fondo-bf-bot.png')
      .setColor('#5865F2');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('entrada')
        .setLabel('🟢 Entrar en servicio')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('salida')
        .setLabel('🔴 Salir de servicio')
        .setStyle(ButtonStyle.Danger)
    );

    const mensaje = await canal.send({ embeds: [panelEmbed], components: [row] });
    await mensaje.pin();
  }
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  const registros = fs.existsSync(RUTA_ARCHIVO) ? JSON.parse(fs.readFileSync(RUTA_ARCHIVO)) : {};
  const usuarioId = message.author.id;
  const contenido = message.content.toLowerCase();

  const mostrarResumen = async (dias) => {
    const registrosUsuario = registros[usuarioId] || [];
    const filtrados = filtrarPorRango(registrosUsuario, dias);
    const horas = calcularHoras(filtrados);
    const embed = new EmbedBuilder()
      .setTitle(`📊 Resumen últimos ${dias} día(s)`)
      .setDescription(`⏱ Has trabajado aproximadamente **${horas} horas**.`)
      .setColor('#3498db');

    const reply = await message.reply({ embeds: [embed] });
    setTimeout(() => reply.delete().catch(() => {}), 30000);
    setTimeout(() => message.delete().catch(() => {}), 30000);
  };

  const mostrarRanking = async (dias) => {
    let ranking = [];
    for (const [id, lista] of Object.entries(registros)) {
      const filtrados = filtrarPorRango(lista, dias);
      const horas = parseFloat(calcularHoras(filtrados));
      const nombre = lista[0]?.username || 'Usuario';
      if (horas > 0) ranking.push({ nombre, horas });
    }
    ranking.sort((a, b) => b.horas - a.horas);
    const top = ranking.map((u, i) => `🥇 ${i + 1}. **${u.nombre}** – ${u.horas}h`).join('\n');
    const embed = new EmbedBuilder()
      .setTitle(`🏆 Ranking últimos ${dias} día(s)`)
      .setDescription(top || 'Sin registros')
      .setColor('#ffaa00');

    const reply = await message.channel.send({ embeds: [embed] });
    setTimeout(() => reply.delete().catch(() => {}), 30000);
    setTimeout(() => message.delete().catch(() => {}), 30000);
  };

  if (contenido === '!resumen dia') return mostrarResumen(1);
  if (contenido === '!resumen semana') return mostrarResumen(7);
  if (contenido === '!resumen mes') return mostrarResumen(30);

  if (contenido === '!ranking dia') return mostrarRanking(1);
  if (contenido === '!ranking semana') return mostrarRanking(7);
  if (contenido === '!ranking mes') return mostrarRanking(30);

  if (contenido.startsWith('!forzar_salida ')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ No tienes permisos para usar este comando.');
    }

    const menciones = message.mentions.users;
    if (!menciones.size) {
      return message.reply('❌ Debes mencionar al menos un usuario.');
    }

    let registrosMod = fs.existsSync(RUTA_ARCHIVO) ? JSON.parse(fs.readFileSync(RUTA_ARCHIVO)) : {};
    let confirmaciones = [];

    menciones.forEach(usuario => {
      const id = usuario.id;
      const datos = registrosMod[id] || [];
      const entradas = datos.filter(r => r.tipo === 'entrada');
      const salidas = datos.filter(r => r.tipo === 'salida');
      if (entradas.length > salidas.length) {
        guardarRegistro(id, 'salida', usuario.username);
        confirmaciones.push(`✅ Salida forzada para **${usuario.username}**`);
      } else {
        confirmaciones.push(`⚠️ **${usuario.username}** no tiene entrada activa.`);
      }
    });

    const embed = new EmbedBuilder()
      .setTitle('🔐 Forzar salida')
      .setDescription(confirmaciones.join('\n'))
      .setColor('#ff9900');

    const reply = await message.reply({ embeds: [embed] });
    setTimeout(() => reply.delete().catch(() => {}), 10000);
    setTimeout(() => message.delete().catch(() => {}), 10000);
  }

  if (contenido === '!forzar_salida_todos') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ No tienes permisos para usar este comando.');
    }

    let registrosTodos = fs.existsSync(RUTA_ARCHIVO) ? JSON.parse(fs.readFileSync(RUTA_ARCHIVO)) : {};
    let total = 0;

    for (const [id, lista] of Object.entries(registrosTodos)) {
      const entradas = lista.filter(r => r.tipo === 'entrada');
      const salidas = lista.filter(r => r.tipo === 'salida');
      const username = lista[0]?.username || 'Usuario';
      if (entradas.length > salidas.length) {
        guardarRegistro(id, 'salida', username);
        total++;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('🔐 Salidas Forzadas')
      .setDescription(`Se forzaron ${total} salidas activas.`)
      .setColor('#ff9900');

    const reply = await message.reply({ embeds: [embed] });
    setTimeout(() => reply.delete().catch(() => {}), 10000);
    setTimeout(() => message.delete().catch(() => {}), 10000);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;
  const username = interaction.user.username;
  let registros = fs.existsSync(RUTA_ARCHIVO) ? JSON.parse(fs.readFileSync(RUTA_ARCHIVO)) : {};
  const entradas = registros[userId]?.filter(r => r.tipo === 'entrada') || [];
  const salidas = registros[userId]?.filter(r => r.tipo === 'salida') || [];

  if (interaction.customId === 'entrada') {
    if (entradas.length > salidas.length) {
      const embed = new EmbedBuilder()
        .setTitle('⚠️ Ya estás en servicio')
        .setDescription('No puedes marcar entrada dos veces seguidas.')
        .setColor('#ffcc00');

      const msg = await interaction.reply({ embeds: [embed], ephemeral: true });
      setTimeout(() => msg.delete().catch(() => {}), 10000);
      return;
    }

    guardarRegistro(userId, 'entrada', username);

    const embed = new EmbedBuilder()
      .setTitle('✅ Entrada registrada')
      .setDescription(`Has iniciado tu jornada a las **${new Date().toLocaleTimeString()}**`)
      .setColor('#00b300');

    const reply = await interaction.reply({ embeds: [embed], ephemeral: true });
    mensajesEmbedEntrada.set(userId, reply);

    // Eliminar después de 30 segundos
    setTimeout(() => reply.delete().catch(() => {}), 30000);
  }

  if (interaction.customId === 'salida') {
    if (entradas.length <= salidas.length) {
      const embed = new EmbedBuilder()
        .setTitle('⚠️ No estás en servicio')
        .setDescription('Debes marcar entrada antes de poder salir.')
        .setColor('#ffcc00');

      const msg = await interaction.reply({ embeds: [embed], ephemeral: true });
      setTimeout(() => msg.delete().catch(() => {}), 10000);
      return;
    }

    guardarRegistro(userId, 'salida', username);

    const ultimaEntrada = new Date(entradas[entradas.length - 1].fecha);
    const salida = new Date();
    const tiempoMs = salida - ultimaEntrada;
    const minutos = Math.floor((tiempoMs / 60000) % 60);
    const horas = Math.floor(tiempoMs / 3600000);

    const embed = new EmbedBuilder()
      .setTitle('🔴 Saliste de servicio')
      .setDescription(`Estuviste **${horas} horas y ${minutos} minutos** en servicio.`)
      .setColor('#cc0000');

    const reply = await interaction.reply({ embeds: [embed], ephemeral: true });

    // Eliminar después de 30 segundos
    setTimeout(() => reply.delete().catch(() => {}), 30000);
    mensajesEmbedEntrada.delete(userId);
  }
});

client.login(process.env.TOKEN);