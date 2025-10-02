// --- O CÉBRO DO CONECTOR ---
// Este código é uma "Função Serverless" que será executada pela Netlify.
// A sua única missão é:
// 1. Receber uma notificação (webhook) do WhatsApp.
// 2. Enviar a mensagem do utilizador para a IA (Gemini).
// 3. Pegar na resposta da IA e enviá-la de volta para o utilizador no WhatsApp.

// A função `fetch` está disponível globalmente nos ambientes modernos da Netlify (Node.js 18+),
// portanto, a importação explícita de 'node-fetch' não é mais necessária e foi removida para corrigir um erro de implantação.

// A função principal que a Netlify irá chamar.
// O 'event' contém toda a informação da chamada recebida (quem chamou, que dados enviou, etc.)
export const handler = async (event) => {
  // --- PASSO 0: Extrair as nossas chaves secretas do ambiente ---
  // Nunca coloque senhas ou chaves diretamente no código!
  // Iremos configurar isto mais tarde no painel da Netlify.
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN; // O nosso token secreto para o WhatsApp

  // --- PASSO 1: Verificação do Webhook (Acontece apenas uma vez) ---
  // Quando configurar o webhook no painel da Meta, ela enviará um pedido 'GET'
  // para confirmar que este URL é realmente seu.
  if (event.httpMethod === 'GET') {
    const queryParams = event.queryStringParameters;
    const mode = queryParams['hub.mode'];
    const challenge = queryParams['hub.challenge'];
    const token = queryParams['hub.verify_token'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log("Webhook verificado com sucesso!");
      // Se o modo e o token estiverem corretos, respondemos com o 'challenge'.
      return {
        statusCode: 200,
        body: challenge,
      };
    } else {
      // Se algo estiver errado, recusamos o pedido.
      console.error("Falha na verificação do webhook.");
      return {
        statusCode: 403,
        body: 'Falha na verificação',
      };
    }
  }

  // --- PASSO 2: Processar Mensagens Recebidas (Acontece a cada mensagem) ---
  // Se não for um 'GET', assumimos que é um 'POST' com uma nova mensagem.
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body);
      
      // Verificamos a estrutura da mensagem para garantir que é o que esperamos.
      if (body.object === 'whatsapp_business_account' && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const message = body.entry[0].changes[0].value.messages[0];
        
        // Ignoramos mensagens que não são de texto (ex: imagens, stickers, reações).
        if (message.type !== 'text') {
            console.log("Mensagem não textual recebida, a ignorar.");
            return { statusCode: 200, body: 'OK' };
        }

        const userPhoneNumber = message.from; // Número de quem enviou
        const userMessage = message.text.body; // O texto da mensagem
        const waBusinessPhoneId = body.entry[0].changes[0].value.metadata.phone_number_id;

        console.log(`Mensagem recebida de ${userPhoneNumber}: "${userMessage}"`);

        // --- PASSO 3: Chamar a IA para obter uma resposta ---
        console.log("A enviar para a IA...");
        
        // TODO: Substituir este prompt estático com o prompt do seu produto
        const systemPrompt = "Você é um assistente de vendas amigável e eficiente. Responda de forma concisa e útil.";
        
        // CORREÇÃO FINAL: Mudança para a versão ESTÁVEL (v1) da API da Google em vez de (v1beta).
        // Usamos o modelo 'gemini-pro' que é o mais compatível.
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: `${systemPrompt}\n\nCLIENTE: ${userMessage}` }]
                }]
            }),
        });
        
        const geminiResult = await geminiResponse.json();

        // Adicionado para depuração: Imprime a resposta completa da API Gemini para análise.
        console.log("Resposta completa da API Gemini:", JSON.stringify(geminiResult, null, 2));
        
        if (!geminiResult.candidates || !geminiResult.candidates[0].content.parts[0].text) {
            // Se a resposta ainda falhar, pode ser devido a filtros de segurança. O log mostrará o motivo.
            if(geminiResult.candidates && geminiResult.candidates[0].finishReason) {
                console.error("A IA terminou a geração por um motivo inesperado:", geminiResult.candidates[0].finishReason);
            }
            throw new Error('Resposta da IA inválida ou vazia. Verifique os logs para a resposta completa da API.');
        }

        const aiResponseText = geminiResult.candidates[0].content.parts[0].text.trim();
        console.log(`Resposta da IA: "${aiResponseText}"`);
        
        // --- PASSO 4: Enviar a resposta da IA de volta para o WhatsApp ---
        console.log("A enviar resposta para o WhatsApp...");
        await fetch(`https://graph.facebook.com/v20.0/${waBusinessPhoneId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: userPhoneNumber,
                text: { body: aiResponseText },
            }),
        });

        console.log("Resposta enviada com sucesso!");
        // Informamos à Meta que processámos a mensagem com sucesso.
        return { statusCode: 200, body: 'OK' };

      } else {
        // Se a mensagem não tiver a estrutura esperada, ignoramos.
        console.log("Webhook recebido, mas não é uma mensagem de utilizador válida.");
        return { statusCode: 200, body: 'Evento ignorado' };
      }
    } catch (error) {
      console.error('Erro no processamento do webhook:', error);
      // Se ocorrer um erro, informamos que algo correu mal, mas não quebramos.
      return { statusCode: 500, body: 'Erro interno' };
    }
  }

  // Se o método não for GET nem POST, retornamos um erro.
  return {
    statusCode: 405, // Method Not Allowed
    body: 'Método não permitido',
  };
};









