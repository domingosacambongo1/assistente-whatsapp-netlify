// --- O CÉBRO DO CONECTOR (VERSÃO MODULAR) ---
// Este código foi atualizado para suportar múltiplos fornecedores de IA.

export const handler = async (event) => {
  // --- PASSO 0: Extrair as nossas chaves secretas do ambiente ---
  // Adicione a chave do fornecedor escolhido no painel da Netlify.
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  
  // Chaves de API para os diferentes fornecedores
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const MOONSHOT_API_KEY = process.env.MOONSHOT_API_KEY; 

  // --- PASSO 1: Verificação do Webhook (Sem alterações) ---
  if (event.httpMethod === 'GET') {
    const queryParams = event.queryStringParameters;
    const mode = queryParams['hub.mode'];
    const challenge = queryParams['hub.challenge'];
    const token = queryParams['hub.verify_token'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return { statusCode: 200, body: challenge };
    } else {
      return { statusCode: 403, body: 'Falha na verificação' };
    }
  }

  // --- PASSO 2: Processar Mensagens Recebidas (Sem alterações) ---
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body);
      
      if (body.object === 'whatsapp_business_account' && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const message = body.entry[0].changes[0].value.messages[0];
        
        if (message.type !== 'text') {
            return { statusCode: 200, body: 'OK' };
        }

        const userPhoneNumber = message.from;
        const userMessage = message.text.body;
        const waBusinessPhoneId = body.entry[0].changes[0].value.metadata.phone_number_id;

        console.log(`Mensagem recebida de ${userPhoneNumber}: "${userMessage}"`);

        // --- PASSO 3: Chamar a IA para obter uma resposta ---
        
        const systemPrompt = "Você é um assistente de vendas amigável e eficiente. Responda de forma concisa e útil.";
        let aiResponseText = "Não consegui processar o seu pedido. Tente novamente."; // Resposta padrão

        // ### ESCOLHA A SUA IA AQUI ###
        // A opção Groq está ativa por defeito.
        
        // --- OPÇÃO 1: GROQ ---
        try {
            console.log("A contactar a Groq...");
            const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "moonshotai/kimi-k2-instruct-0905", 
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userMessage }
                    ]
                })
            });
            const groqResult = await groqResponse.json();
            if (groqResult.choices && groqResult.choices[0].message.content) {
                aiResponseText = groqResult.choices[0].message.content.trim();
            } else {
                 console.error("Resposta da Groq inválida:", JSON.stringify(groqResult, null, 2));
            }
        } catch(e) { console.error("Erro ao chamar a Groq:", e); }
        // --- FIM DA OPÇÃO 1 ---

        console.log(`Resposta da IA: "${aiResponseText}"`);
        
        // --- PASSO 4: Enviar a resposta de volta para o WhatsApp ---
        // **MELHORIA DE DIAGNÓSTICO:** Agora verificamos a resposta da API da Meta.
        const metaApiResponse = await fetch(`https://graph.facebook.com/v20.0/${waBusinessPhoneId}/messages`, {
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

        const metaApiResult = await metaApiResponse.json();

        if (!metaApiResponse.ok) {
            console.error("A API da Meta reportou um erro:", JSON.stringify(metaApiResult, null, 2));
        } else {
            console.log("Resposta enviada com sucesso! Resposta da Meta:", JSON.stringify(metaApiResult, null, 2));
        }
        
        return { statusCode: 200, body: 'OK' };
      } else {
        return { statusCode: 200, body: 'Evento ignorado' };
      }
    } catch (error) {
      console.error('Erro no processamento do webhook:', error);
      return { statusCode: 500, body: 'Erro interno' };
    }
  }

  return { statusCode: 405, body: 'Método não permitido' };
};



















