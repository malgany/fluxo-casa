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
    label: "Farmácia",
    src: "/service-icons/farmacia.svg",
    aliases: ["farmacia", "remedio", "medicamento", "saude", "drogaria"]
  },
  {
    id: "salario",
    label: "Salário",
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
    label: "Manutenção",
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
  },
  {
    id: "contador",
    label: "Contador",
    src: "/service-icons/contador.svg",
    aliases: ["contador", "contabilidade", "imposto", "mei", "declaracao"]
  },
  {
    id: "internet",
    label: "Internet",
    src: "/service-icons/internet.svg",
    aliases: ["internet", "wifi", "banda larga", "fibra", "rede"]
  },
  {
    id: "telefone",
    label: "Telefone",
    src: "/service-icons/telefone.svg",
    aliases: ["telefone", "celular", "chip", "pos pago", "plano"]
  },
  {
    id: "gas",
    label: "Gás",
    src: "/service-icons/gas.svg",
    aliases: ["gas", "botijao", "cozinha", "glp"]
  },
  {
    id: "condominio",
    label: "Condomínio",
    src: "/service-icons/condominio.svg",
    aliases: ["condominio", "predio", "apartamento", "moradia"]
  },
  {
    id: "financiamento",
    label: "Financiamento",
    src: "/service-icons/financiamento.svg",
    aliases: ["financiamento", "imovel", "veiculo", "parcela", "credito"]
  },
  {
    id: "emprestimo",
    label: "Empréstimo",
    src: "/service-icons/emprestimo.svg",
    aliases: ["emprestimo", "credito", "divida", "parcela", "banco"]
  },
  {
    id: "cartao-credito",
    label: "Cartão de crédito",
    src: "/service-icons/cartao-credito.svg",
    aliases: ["cartao", "cartao de credito", "fatura", "credito"]
  },
  {
    id: "banco",
    label: "Banco",
    src: "/service-icons/banco.svg",
    aliases: ["banco", "tarifa", "conta", "pix", "ted"]
  },
  {
    id: "investimentos",
    label: "Investimentos",
    src: "/service-icons/investimentos.svg",
    aliases: ["investimentos", "investimento", "corretora", "renda fixa", "acoes"]
  },
  {
    id: "poupanca",
    label: "Poupança",
    src: "/service-icons/poupanca.svg",
    aliases: ["poupanca", "reserva", "guardar dinheiro", "economia"]
  },
  {
    id: "previdencia",
    label: "Previdência",
    src: "/service-icons/previdencia.svg",
    aliases: ["previdencia", "aposentadoria", "futuro", "inss"]
  },
  {
    id: "medico",
    label: "Médico",
    src: "/service-icons/medico.svg",
    aliases: ["medico", "consulta", "clinica", "saude"]
  },
  {
    id: "dentista",
    label: "Dentista",
    src: "/service-icons/dentista.svg",
    aliases: ["dentista", "odontologia", "aparelho", "dente"]
  },
  {
    id: "psicologo",
    label: "Psicólogo",
    src: "/service-icons/psicologo.svg",
    aliases: ["psicologo", "terapia", "saude mental", "consulta"]
  },
  {
    id: "exames",
    label: "Exames",
    src: "/service-icons/exames.svg",
    aliases: ["exames", "laboratorio", "checkup", "saude"]
  },
  {
    id: "plano-saude",
    label: "Plano de saúde",
    src: "/service-icons/plano-saude.svg",
    aliases: ["plano de saude", "convenio", "saude", "mensalidade"]
  },
  {
    id: "hospital",
    label: "Hospital",
    src: "/service-icons/hospital.svg",
    aliases: ["hospital", "emergencia", "pronto socorro", "saude"]
  },
  {
    id: "oculos",
    label: "Óculos",
    src: "/service-icons/oculos.svg",
    aliases: ["oculos", "otica", "lente", "grau"]
  },
  {
    id: "beleza",
    label: "Beleza",
    src: "/service-icons/beleza.svg",
    aliases: ["beleza", "salao", "cabelo", "estetica"]
  },
  {
    id: "barbearia",
    label: "Barbearia",
    src: "/service-icons/barbearia.svg",
    aliases: ["barbearia", "barba", "corte", "cabelo"]
  },
  {
    id: "higiene",
    label: "Higiene",
    src: "/service-icons/higiene.svg",
    aliases: ["higiene", "shampoo", "sabonete", "cuidado pessoal"]
  },
  {
    id: "roupas",
    label: "Roupas",
    src: "/service-icons/roupas.svg",
    aliases: ["roupas", "vestuario", "moda", "camisa"]
  },
  {
    id: "calcados",
    label: "Calçados",
    src: "/service-icons/calcados.svg",
    aliases: ["calcados", "sapato", "tenis", "sandalia"]
  },
  {
    id: "lavanderia",
    label: "Lavanderia",
    src: "/service-icons/lavanderia.svg",
    aliases: ["lavanderia", "roupa", "lavagem", "seco"]
  },
  {
    id: "padaria",
    label: "Padaria",
    src: "/service-icons/padaria.svg",
    aliases: ["padaria", "pao", "cafe da manha", "lanche"]
  },
  {
    id: "acougue",
    label: "Açougue",
    src: "/service-icons/acougue.svg",
    aliases: ["acougue", "carne", "churrasco", "frango"]
  },
  {
    id: "hortifruti",
    label: "Hortifruti",
    src: "/service-icons/hortifruti.svg",
    aliases: ["hortifruti", "fruta", "verdura", "legume", "feira"]
  },
  {
    id: "restaurante",
    label: "Restaurante",
    src: "/service-icons/restaurante.svg",
    aliases: ["restaurante", "almoco", "jantar", "comida"]
  },
  {
    id: "cafe",
    label: "Café",
    src: "/service-icons/cafe.svg",
    aliases: ["cafe", "cafeteria", "cappuccino", "lanche"]
  },
  {
    id: "transporte-publico",
    label: "Transporte público",
    src: "/service-icons/transporte-publico.svg",
    aliases: ["transporte publico", "onibus", "metro", "bilhete"]
  },
  {
    id: "estacionamento",
    label: "Estacionamento",
    src: "/service-icons/estacionamento.svg",
    aliases: ["estacionamento", "vaga", "zona azul", "parking"]
  },
  {
    id: "pedagio",
    label: "Pedágio",
    src: "/service-icons/pedagio.svg",
    aliases: ["pedagio", "estrada", "rodovia", "viagem"]
  },
  {
    id: "oficina",
    label: "Oficina",
    src: "/service-icons/oficina.svg",
    aliases: ["oficina", "mecanico", "carro", "reparo"]
  },
  {
    id: "ipva",
    label: "IPVA",
    src: "/service-icons/ipva.svg",
    aliases: ["ipva", "documento", "veiculo", "imposto"]
  },
  {
    id: "licenciamento",
    label: "Licenciamento",
    src: "/service-icons/licenciamento.svg",
    aliases: ["licenciamento", "detran", "veiculo", "documento"]
  },
  {
    id: "multa",
    label: "Multa",
    src: "/service-icons/multa.svg",
    aliases: ["multa", "transito", "infracao", "detran"]
  },
  {
    id: "taxi",
    label: "Táxi",
    src: "/service-icons/taxi.svg",
    aliases: ["taxi", "corrida", "transporte", "motorista"]
  },
  {
    id: "noventa-e-nove",
    label: "99",
    src: "/service-icons/noventa-e-nove.svg",
    aliases: ["99", "noventa e nove", "corrida", "transporte", "motorista"]
  },
  {
    id: "moveis",
    label: "Móveis",
    src: "/service-icons/moveis.svg",
    aliases: ["moveis", "mobilia", "casa", "decoracao"]
  },
  {
    id: "eletrodomesticos",
    label: "Eletrodomésticos",
    src: "/service-icons/eletrodomesticos.svg",
    aliases: ["eletrodomesticos", "geladeira", "fogao", "maquina"]
  },
  {
    id: "limpeza",
    label: "Limpeza",
    src: "/service-icons/limpeza.svg",
    aliases: ["limpeza", "casa", "produtos", "faxina"]
  },
  {
    id: "jardinagem",
    label: "Jardinagem",
    src: "/service-icons/jardinagem.svg",
    aliases: ["jardinagem", "jardim", "planta", "grama"]
  },
  {
    id: "diarista",
    label: "Diarista",
    src: "/service-icons/diarista.svg",
    aliases: ["diarista", "faxina", "limpeza", "casa"]
  },
  {
    id: "baba",
    label: "Babá",
    src: "/service-icons/baba.svg",
    aliases: ["baba", "crianca", "filho", "cuidado"]
  },
  {
    id: "criancas",
    label: "Crianças",
    src: "/service-icons/criancas.svg",
    aliases: ["criancas", "filho", "brinquedo", "infantil"]
  },
  {
    id: "livros",
    label: "Livros",
    src: "/service-icons/livros.svg",
    aliases: ["livros", "livro", "leitura", "estudo"]
  },
  {
    id: "doacoes",
    label: "Doações",
    src: "/service-icons/doacoes.svg",
    aliases: ["doacoes", "doacao", "caridade", "igreja", "ajuda"]
  },
  {
    id: "correios",
    label: "Correios",
    src: "/service-icons/correios.svg",
    aliases: ["correios", "frete", "encomenda", "pacote"]
  },
  {
    id: "cartorio",
    label: "Cartório",
    src: "/service-icons/cartorio.svg",
    aliases: ["cartorio", "documento", "reconhecimento", "certidao"]
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
