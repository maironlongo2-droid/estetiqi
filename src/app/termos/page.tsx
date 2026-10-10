import type { Metadata } from "next";
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_SUPPORT_EMAIL,
  LegalSection,
  LegalShell,
} from "../legal-shell";

export const metadata: Metadata = {
  title: "Termos de Serviço — EstetiQI",
  description:
    "Condições de uso da plataforma EstetiQI: responsabilidades da profissional e do negócio, uso das integrações com o WhatsApp Business (Meta), proteção de credenciais, limitações e encerramento da conta.",
  alternates: { canonical: "/termos" },
};

// PENDÊNCIA (aguardando informação do responsável pelo produto): razão social,
// CNPJ, endereço comercial, foro/comarca e condições comerciais (planos,
// valores, renovação e cancelamento) NÃO estão definidos no projeto. Nenhum
// dado fictício é publicado aqui. Atualizar esta página quando forem
// informados.

export default function TermosPage() {
  return (
    <LegalShell
      title="Termos de Serviço"
      summary="Estes termos descrevem o que o EstetiQI oferece, quais são as responsabilidades do negócio e do usuário, como as integrações podem ser usadas e o que acontece em caso de encerramento ou de uso indevido."
    >
      <LegalSection title="1. Aceitação destes termos">
        <p>
          Ao criar uma conta, acessar ou usar o EstetiQI, o usuário declara ter
          lido e aceito estes Termos de Serviço e a Política de Privacidade
          publicada em https://estetiqi.com.br/privacidade. Se o uso for feito em
          nome de um negócio de estética, quem aceita declara ter poderes para
          representá-lo.
        </p>
        <p>
          Caso não concorde com estas condições, o serviço não deve ser
          utilizado.
        </p>
      </LegalSection>

      <LegalSection title="2. O que o EstetiQI oferece">
        <p>
          O EstetiQI é um software de gestão (SaaS) para profissionais e empresas
          de estética, acessado por navegador. Entre as funções disponíveis
          estão:
        </p>
        <ul>
          <li>cadastro e histórico de clientes;</li>
          <li>cadastro de procedimentos, valores, duração e retorno;</li>
          <li>cadastro de profissionais e da disponibilidade de horários;</li>
          <li>agenda com agendamentos, bloqueios e situações de atendimento;</li>
          <li>registro de pagamentos, inclusive divididos, e acompanhamento financeiro;</li>
          <li>
            página pública de cada negócio, com cartão digital e agendamento
            online pela própria cliente;
          </li>
          <li>
            sugestões de ação e de mensagens de reativação, com envio pelo
            WhatsApp sob decisão do usuário;
          </li>
          <li>
            conexão oficial de um número de WhatsApp Business do próprio negócio,
            por meio da API da Meta.
          </li>
        </ul>
        <p>
          As funcionalidades podem evoluir: recursos podem ser ajustados,
          suspensos ou substituídos para melhorar o serviço ou por exigência
          técnica e legal.
        </p>
      </LegalSection>

      <LegalSection title="3. Cadastro, conta e equipe">
        <ul>
          <li>
            O acesso é feito por autenticação gerenciada por provedor
            especializado, com a criação de uma conta de usuário vinculada a um
            negócio (organização).
          </li>
          <li>
            O usuário deve fornecer informações verdadeiras, completas e
            atualizadas no cadastro e manter a conta atualizada.
          </li>
          <li>
            Cada organização possui papéis com permissões diferentes. É
            responsabilidade de quem administra o negócio conceder acesso apenas
            às pessoas autorizadas e revisar esse acesso periodicamente.
          </li>
          <li>
            É proibido criar contas para terceiros sem autorização ou usar a
            plataforma para representar negócio que não seja o próprio.
          </li>
        </ul>
      </LegalSection>
      <LegalSection title="4. Responsabilidades do negócio e do usuário">
        <p>Quem usa o EstetiQI é responsável por:</p>
        <ul>
          <li>
            <strong>Base legal dos dados que cadastra:</strong> garantir que tem
            fundamento jurídico para tratar os dados das suas clientes e da sua
            equipe e atender às solicitações dos titulares, conforme a LGPD;
          </li>
          <li>
            <strong>Conteúdo inserido:</strong> a veracidade e a licitude dos
            dados, textos, imagens, valores e mensagens que cadastra ou envia,
            inclusive imagens enviadas para o cartão digital e fotos de
            profissionais;
          </li>
          <li>
            <strong>Uso das mensagens:</strong> obter o consentimento necessário e
            enviar mensagens apenas a pessoas com quem mantenha relação legítima,
            sem spam, conteúdo enganoso, ilícito ou ofensivo;
          </li>
          <li>
            <strong>Atendimento às próprias clientes:</strong> responder às
            solicitações de titulares cujos dados foram cadastrados por ele;
          </li>
          <li>
            <strong>Uso correto do sistema:</strong> não tentar burlar limites,
            permissões, controles de segurança ou o isolamento entre negócios.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="integracoes" title="5. Uso legítimo das integrações (WhatsApp e Meta)">
        <ul>
          <li>
            A conexão do WhatsApp é feita exclusivamente pelo Embedded Signup
            oficial da Meta, a partir de um número de WhatsApp Business
            pertencente ao próprio negócio. O EstetiQI não conecta números de
            terceiros.
          </li>
          <li>
            O uso da API está sujeito às regras da Meta, incluindo a janela de
            atendimento de 24 horas para texto livre e a necessidade de modelos
            aprovados fora dela. O descumprimento pode levar à limitação ou ao
            bloqueio do número pela própria Meta, sem participação do EstetiQI.
          </li>
          <li>
            Não é permitido usar a plataforma para automação não oficial de
            WhatsApp, disparo em massa, mensagens não solicitadas ou qualquer
            prática proibida pelas políticas da Meta.
          </li>
          <li>
            As sugestões de mensagens geradas com apoio de inteligência
            artificial são rascunhos: o envio depende sempre da revisão e da
            decisão do usuário, que responde pelo conteúdo enviado.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Credenciais e segurança da conta">
        <ul>
          <li>
            As credenciais de acesso são pessoais e não devem ser compartilhadas.
            O usuário responde pelas ações realizadas com as suas credenciais.
          </li>
          <li>
            As credenciais da integração com a Meta são guardadas de forma
            cifrada e não são exibidas pelo sistema. Não é possível copiá-las pela
            interface, e isso não deve ser tentado.
          </li>
          <li>
            Em caso de suspeita de acesso indevido, perda de dispositivo ou
            uso não autorizado, o usuário deve alterar as credenciais, desconectar
            a integração, se necessário, e comunicar o suporte imediatamente.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Serviços de terceiros e limitações">
        <p>
          O EstetiQI depende de serviços de terceiros para funcionar, como a API
          oficial do WhatsApp (Meta), o serviço de inteligência artificial
          (Google), a autenticação (Clerk), a hospedagem (Vercel) e o banco de
          dados (Neon). O usuário reconhece que:
        </p>
        <ul>
          <li>
            esses serviços podem apresentar indisponibilidade, lentidão, mudanças
            de regra ou interrupções fora do controle do EstetiQI;
          </li>
          <li>
            a entrega de uma mensagem de WhatsApp depende da Meta e do aparelho
            do destinatário; o registro de envio no sistema não equivale a
            confirmação de leitura pela cliente;
          </li>
          <li>
            as análises e os textos sugeridos por inteligência artificial podem
            conter imprecisões e não substituem a avaliação profissional, contábil
            ou jurídica;
          </li>
          <li>
            o EstetiQI não garante resultados comerciais, faturamento,
            retorno de clientes ou qualquer resultado específico decorrente do uso
            do sistema.
          </li>
        </ul>
      </LegalSection>
      <LegalSection title="8. Dados inseridos e propriedade intelectual">
        <ul>
          <li>
            Os dados que o negócio cadastra na plataforma continuam sendo do
            negócio. O EstetiQI trata esses dados como operador, apenas para
            prestar o serviço, conforme a Política de Privacidade.
          </li>
          <li>
            O software, o código, a marca, o layout e os materiais do EstetiQI
            são protegidos por direitos de propriedade intelectual. O
            contratante recebe uma licença de uso limitada, não exclusiva e
            intransferível, restrita ao uso do serviço durante a vigência destes
            termos.
          </li>
          <li>
            É vedado copiar, modificar, revender, sublicenciar, fazer engenharia
            reversa ou explorar o software fora do uso previsto.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="9. Disponibilidade, suporte e manutenção">
        <ul>
          <li>
            O EstetiQI busca manter o serviço disponível de forma contínua, mas
            não garante funcionamento ininterrupto ou livre de erros.
          </li>
          <li>
            Podem ocorrer interrupções por manutenção, atualizações, falhas de
            infraestrutura ou indisponibilidade dos serviços de terceiros.
          </li>
          <li>
            O suporte é prestado pelo canal de suporte dentro do painel e pelos
            endereços de contato informados na seção 16, em horário comercial e
            na ordem de chegada das solicitações.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="10. Suspensão e bloqueio por uso indevido">
        <p>
          O acesso de um negócio ou usuário pode ser suspenso ou bloqueado, de
          forma cautelar ou definitiva, quando houver indícios de:
        </p>
        <ul>
          <li>violação destes termos, da lei ou de direitos de terceiros;</li>
          <li>
            uso para spam, disparo em massa, mensagens não solicitadas ou
            práticas proibidas pelas políticas da Meta;
          </li>
          <li>
            tentativa de burlar autenticação, permissões, limites de uso ou o
            isolamento entre negócios;
          </li>
          <li>
            uso que comprometa a segurança, a estabilidade ou o funcionamento da
            plataforma para os demais usuários;
          </li>
          <li>
            uso fraudulento, inclusive para armazenar ou enviar conteúdo ilícito.
          </li>
        </ul>
        <p>
          Sempre que possível, o bloqueio é precedido de comunicação e de
          oportunidade de correção. Em situações de risco imediato à plataforma
          ou a terceiros, a medida pode ser aplicada imediatamente, com
          informação posterior ao responsável pela conta.
        </p>
      </LegalSection>

      <LegalSection title="11. Encerramento da conta">
        <ul>
          <li>
            O negócio pode solicitar o encerramento da conta pelo canal de
            contato indicado na seção 16. A solicitação deve partir do
            responsável pela conta.
          </li>
          <li>
            Antes do encerramento, recomenda-se desconectar a integração do
            WhatsApp e reunir as informações que o negócio precisa manter
            consigo, já que o acesso à plataforma será interrompido.
          </li>
          <li>
            Após o encerramento, os dados são eliminados ou anonimizados conforme
            a Política de Privacidade, ressalvadas as informações que devam ser
            mantidas por obrigação legal ou para o exercício regular de direitos.
          </li>
        </ul>
      </LegalSection>
      <LegalSection title="12. Planos e condições comerciais">
        <p>
          O EstetiQI pode ser oferecido em diferentes planos e condições,
          inclusive em período de teste ou de uso gratuito. As condições
          aplicáveis — valores, forma de pagamento, renovação e cancelamento —
          são apresentadas ao usuário de forma clara antes de qualquer
          contratação e podem ser consultadas pelo canal de contato indicado na
          seção 16.
        </p>
        <p>
          A plataforma não realiza cobrança automática por meio de cartão dentro
          do aplicativo. Enquanto não houver plano pago contratado, o uso segue
          as condições informadas no momento do cadastro ou do contato comercial.
        </p>
      </LegalSection>

      <LegalSection title="13. Limitação de responsabilidade">
        <p>
          O serviço é fornecido no estado em que se encontra e conforme as
          funcionalidades descritas. Na máxima extensão permitida pela legislação
          aplicável, o EstetiQI não responde por:
        </p>
        <ul>
          <li>
            prejuízos decorrentes de informações incorretas, incompletas ou
            desatualizadas inseridas pelo próprio usuário;
          </li>
          <li>
            decisões comerciais, financeiras ou clínicas tomadas com base em
            sugestões do sistema ou de inteligência artificial;
          </li>
          <li>
            indisponibilidade, alteração de regras, limitação ou bloqueio
            impostos por serviços de terceiros, incluindo a Meta e o WhatsApp;
          </li>
          <li>
            uso indevido das credenciais de acesso pelo usuário ou por quem ele
            autorizou;
          </li>
          <li>
            lucros cessantes, perda de oportunidade ou danos indiretos
            decorrentes do uso ou da impossibilidade de uso do serviço.
          </li>
        </ul>
        <p>
          Nada nestes termos afasta direitos assegurados ao consumidor pela
          legislação brasileira, nem limita responsabilidades que não possam ser
          limitadas por lei.
        </p>
      </LegalSection>

      <LegalSection title="14. Alterações destes termos">
        <p>
          Estes termos podem ser atualizados para acompanhar mudanças no produto,
          na legislação ou nos serviços de terceiros utilizados. A data da última
          atualização é indicada no início do documento. O uso contínuo do
          EstetiQI após uma atualização representa concordância com a nova
          versão; alterações relevantes serão comunicadas pelos canais do
          produto.
        </p>
      </LegalSection>

      <LegalSection title="15. Legislação aplicável e conflitos">
        <p>
          Estes termos são regidos pela legislação brasileira. Em caso de
          divergência, as partes buscarão solução por diálogo, pelo canal de
          contato indicado na seção 16, antes de qualquer medida formal.
          Permanecem asseguradas as competências previstas na legislação
          aplicável, inclusive as regras de defesa do consumidor.
        </p>
      </LegalSection>

      <LegalSection id="contato" title="16. Contato">
        <ul>
          <li>
            <strong>Assuntos gerais e jurídicos:</strong>{" "}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
          </li>
          <li>
            <strong>Suporte técnico:</strong>{" "}
            <a href={`mailto:${LEGAL_SUPPORT_EMAIL}`}>{LEGAL_SUPPORT_EMAIL}</a>{" "}
            e a área de suporte dentro do painel do EstetiQI
          </li>
        </ul>
        <p>
          Consulte também a Política de Privacidade, disponível em
          https://estetiqi.com.br/privacidade.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
