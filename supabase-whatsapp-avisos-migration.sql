-- Avisos automáticos de OS pelo WhatsApp (entrada, pronta, lembretes, último aviso, retirada).
-- Pode ser rodado mais de uma vez.

-- Quando a OS ficou pronta: base da contagem dos lembretes de retirada.
-- Fica vazio nas OS antigas de propósito, para elas não receberem lembrete em massa.
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS pronta_em TIMESTAMPTZ;

-- Avisos já enviados por OS: {"entrada": "<data>", "lembrete_30": "<data>", ...}
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS wa_avisos JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Quais avisos a loja ligou e em que dias saem os lembretes
ALTER TABLE wa_config ADD COLUMN IF NOT EXISTS avisos JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_os_pronta_em ON ordens_servico (pronta_em) WHERE status = 'pronta';
