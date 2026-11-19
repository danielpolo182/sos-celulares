-- Regras de convivência do agente de IA com os atendentes.
-- Pode ser rodado mais de uma vez.

-- Até quando o agente fica calado na conversa (alguém da loja respondeu)
ALTER TABLE wa_conversas ADD COLUMN IF NOT EXISTS bot_pausado_ate TIMESTAMPTZ;

-- Tempo da pausa e números de teste: {"pausa_min": 120, "numeros_teste": ["5541..."]}
ALTER TABLE wa_config ADD COLUMN IF NOT EXISTS bot_config JSONB NOT NULL DEFAULT '{}'::jsonb;
