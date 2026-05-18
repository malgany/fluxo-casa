export interface ServiceIcon {
  id: string;
  label: string;
  src: string;
  aliases: string[];
}

export const serviceIcons = [
  {
    id: "netflix",
    label: "Netflix",
    src: "/service-icons/netflix.svg",
    aliases: ["netflix", "streaming", "filme", "serie", "entretenimento"]
  },
  {
    id: "disney-plus",
    label: "Disney+",
    src: "/service-icons/disney-plus.svg",
    aliases: ["disney", "disney plus", "streaming", "filme", "serie", "entretenimento"]
  },
  {
    id: "crunchyroll",
    label: "Crunchyroll",
    src: "/service-icons/crunchyroll.svg",
    aliases: ["crunchyroll", "anime", "streaming", "entretenimento"]
  },
  {
    id: "prime-video",
    label: "Prime Video",
    src: "/service-icons/prime-video.svg",
    aliases: ["prime", "prime video", "amazon prime", "amazon", "streaming", "filme", "serie"]
  },
  {
    id: "openai",
    label: "OpenAI",
    src: "/service-icons/openai.svg",
    aliases: ["openai", "chatgpt", "gpt", "ia", "inteligencia artificial"]
  },
  {
    id: "mercado",
    label: "Mercado",
    src: "/service-icons/mercado.svg",
    aliases: ["mercado", "supermercado", "compras", "feira", "alimento"]
  },
  {
    id: "academia",
    label: "Academia",
    src: "/service-icons/academia.svg",
    aliases: ["academia", "gym", "treino", "musculacao", "exercicio", "fitness"]
  },
  {
    id: "farmacia",
    label: "Farmacia",
    src: "/service-icons/farmacia.svg",
    aliases: ["farmacia", "remedio", "medicamento", "saude", "drogaria"]
  },
  {
    id: "salario",
    label: "Salario",
    src: "/service-icons/salario.svg",
    aliases: ["salario", "renda", "pagamento", "ordenado", "recebimento", "trabalho"]
  },
  {
    id: "gasolina",
    label: "Gasolina",
    src: "/service-icons/gasolina.svg",
    aliases: ["gasolina", "combustivel", "posto", "abastecer", "etanol", "diesel", "carro"]
  },
  {
    id: "lanche",
    label: "Lanche",
    src: "/service-icons/lanche.svg",
    aliases: ["lanche", "pizza", "hamburguer", "batata", "refrigerante", "besteira", "bobeira", "comida"]
  },
  {
    id: "aluguel",
    label: "Aluguel",
    src: "/service-icons/aluguel.svg",
    aliases: ["aluguel", "casa", "apartamento", "moradia", "condominio", "imovel"]
  },
  {
    id: "escola",
    label: "Escola",
    src: "/service-icons/escola.svg",
    aliases: ["escola", "faculdade", "curso", "educacao", "material escolar", "estudo"]
  },
  {
    id: "pet",
    label: "Pet",
    src: "/service-icons/pet.svg",
    aliases: ["pet", "animal", "cachorro", "gato", "racao", "veterinario"]
  },
  {
    id: "assinatura",
    label: "Assinatura",
    src: "/service-icons/assinatura.svg",
    aliases: ["assinatura", "mensalidade", "recorrente", "plano", "servico", "subscription"]
  },
  {
    id: "presente",
    label: "Presente",
    src: "/service-icons/presente.svg",
    aliases: ["presente", "gift", "aniversario", "comemoracao", "lembranca"]
  },
  {
    id: "manutencao",
    label: "Manutencao",
    src: "/service-icons/manutencao.svg",
    aliases: ["manutencao", "conserto", "reparo", "ferramenta", "obra", "oficina"]
  },
  {
    id: "seguro",
    label: "Seguro",
    src: "/service-icons/seguro.svg",
    aliases: ["seguro", "protecao", "apolice", "garantia", "plano"]
  },
  {
    id: "viagem",
    label: "Viagem",
    src: "/service-icons/viagem.svg",
    aliases: ["viagem", "passagem", "hotel", "ferias", "mala", "aviao", "turismo"]
  },
  {
    id: "impostos",
    label: "Impostos",
    src: "/service-icons/impostos.svg",
    aliases: ["impostos", "taxa", "tributo", "ipva", "iptu", "ir", "receita"]
  },
  {
    id: "energisa",
    label: "Energisa",
    src: "/service-icons/energisa.svg",
    aliases: ["energisa", "energiza", "energia", "luz", "conta de luz"]
  },
  {
    id: "aguas-guariroba",
    label: "Águas Guariroba",
    src: "/service-icons/aguas-guariroba.svg",
    aliases: ["águas", "aguas", "água", "agua", "guariroba", "saneamento", "conta de água", "conta de agua"]
  },
  {
    id: "claro",
    label: "Claro",
    src: "/service-icons/claro.svg",
    aliases: ["claro", "internet", "telefone", "celular", "plano"]
  },
  {
    id: "lazer",
    label: "Lazer",
    src: "/service-icons/lazer.svg",
    aliases: ["lazer", "passeio", "bar", "cinema", "diversao"]
  },
  {
    id: "ifood",
    label: "iFood",
    src: "/service-icons/ifood.svg",
    aliases: ["ifood", "delivery", "comida", "restaurante", "lanche"]
  },
  {
    id: "ze-delivery",
    label: "Zé Delivery",
    src: "/service-icons/ze-delivery.svg",
    aliases: ["zé delivery", "ze delivery", "zé", "ze", "bebida", "cerveja", "delivery"]
  },
  {
    id: "uber",
    label: "Uber",
    src: "/service-icons/uber.svg",
    aliases: ["uber", "transporte", "corrida", "motorista", "viagem"]
  },
  {
    id: "amazon",
    label: "Amazon",
    src: "/service-icons/amazon.svg",
    aliases: ["amazon", "compra", "shopping", "loja", "marketplace"]
  },
  {
    id: "shopee",
    label: "Shopee",
    src: "/service-icons/shopee.svg",
    aliases: ["shopee", "compra", "shopping", "loja", "marketplace"]
  },
  {
    id: "mercado-livre",
    label: "Mercado Livre",
    src: "/service-icons/mercado-livre.svg",
    aliases: ["mercado livre", "mercadolivre", "ml", "compra", "shopping", "loja", "marketplace"]
  },
  {
    id: "entretenimento",
    label: "Entretenimento",
    src: "/service-icons/entretenimento.svg",
    aliases: ["entretenimento", "streaming", "filme", "serie", "show", "jogo"]
  }
] as const satisfies readonly ServiceIcon[];

export type ServiceIconId = (typeof serviceIcons)[number]["id"];

export function findIconById(iconId?: string): ServiceIcon | undefined {
  return serviceIcons.find((icon) => icon.id === iconId);
}

export function searchIconOptions(input: string, selectedIconId?: string): ServiceIcon[] {
  const query = normalize(input);
  if (!query) return [];

  const terms = query.split(/\s+/).filter(Boolean);
  return serviceIcons
    .map((icon, index) => ({ icon, index, score: scoreIcon(icon, terms, query) }))
    .filter((result) => result.score > 0 && result.icon.id !== selectedIconId)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((result) => result.icon);
}

function scoreIcon(icon: ServiceIcon, terms: string[], query: string): number {
  const values = [icon.label, ...icon.aliases].map(normalize);
  if (values.some((value) => value === query)) return 100;
  if (values.some((value) => value.startsWith(query))) return 80;
  if (values.some((value) => value.includes(query))) return 60;
  if (terms.every((term) => values.some((value) => value.includes(term)))) return 40;
  return 0;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
