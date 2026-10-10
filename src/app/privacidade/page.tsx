import type { Metadata } from "next";
import {
  LEGAL_CONTACT_EMAIL,
  LegalSection,
  LegalShell,
} from "../legal-shell";

export const metadata: Metadata = {
  title: "Política de Privacidade — EstetiQI",
  description:
    "Como o EstetiQI trata dados pessoais na gestão de negócios de estética, incluindo a integração com o WhatsApp Business (Meta) e os recursos de inteligência artificial.",
  alternates: { canonical: "/privacidade" },
};

// PENDÊNCIA (aguardando informação do responsável pelo produto): razão social,
// CNPJ, endereço comercial, nomeação de encarregado (DPO) e prazos formais de
// retenção NÃO existem no projeto nem na configuração do repositório. Por isso
// nenhum desses dados é publicado aqui: o documento identifica o serviço pelo
// nome do produto e pelo canal de contato real já usado no sistema. Assim que
// forem informados, devem ser incluídos nesta página.

export default function PrivacidadePage() {
  return (
    <LegalShell
      title="Política de Privacidade"
      summary="Esta política explica quais dados pessoais o EstetiQI trata, com quais finalidades, com quem são compartilhados, por quanto tempo são mantidos e como o titular pode exercer os seus direitos previstos na LGPD."
    >
      <LegalSection title="1. O que é o EstetiQI">
        <p>
          O EstetiQI é um software de gestão (SaaS) para profissionais e empresas
          de estética. A plataforma ajuda a organizar clientes, procedimentos,
          agenda e pagamentos, a acompanhar o financeiro, a identificar clientes
          que podem retornar e a preparar mensagens de reativação para envio pelo
          WhatsApp.
        </p>
        <p>
          O serviço é acessado pelo endereço https://estetiqi.com.br e inclui
          páginas públicas de agendamento (o cartão digital de cada negócio), que
          podem ser abertas por qualquer pessoa, sem login.
        </p>
        <p>
          <strong>Canal de privacidade:</strong>{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>

      <LegalSection id="papeis" title="2. Quem decide e quem opera os dados">
        <p>
          A Lei Geral de Proteção de Dados (Lei nº 13.709/2018) diferencia o
          controlador, que decide sobre o tratamento, do operador, que trata os
          dados em nome do controlador. No EstetiQI:
        </p>
        <ul>
          <li>
            <strong>Negócio de estética (usuário do EstetiQI):</strong> é o
            controlador dos dados que cadastra na plataforma, como os dados das
            suas clientes, dos seus profissionais, dos atendimentos e dos
            pagamentos. Ao usar o sistema, o negócio é responsável por ter base
            legal para tratar esses dados e por atender as solicitações das suas
            próprias clientes.
          </li>
          <li>
            <strong>EstetiQI:</strong> é operador desses dados, tratando-os
            apenas para prestar o serviço contratado. É controlador dos dados de
            cadastro e autenticação do usuário da plataforma, dos registros de
            segurança, das solicitações de suporte feitas à plataforma e da
            operação do serviço como um todo.
          </li>
        </ul>
        <p>
          Se uma cliente final quiser exercer direitos sobre dados cadastrados
          por um negócio de estética, ela deve procurar esse negócio. O EstetiQI
          apoia o atendimento quando for necessário, pelo canal de privacidade
          indicado nesta política.
        </p>
      </LegalSection>
      <LegalSection id="dados" title="3. Quais dados são tratados">
        <p>
          Tratamos apenas os dados necessários para o funcionamento do produto,
          conforme as funcionalidades realmente existentes:
        </p>
        <ul>
          <li>
            <strong>Conta e autenticação:</strong> nome, e-mail e identificador
            do usuário no serviço de autenticação, além do negócio vinculado e do
            papel dentro dele (por exemplo, proprietário). A senha não é
            armazenada pela aplicação: a autenticação é feita por um provedor
            especializado.
          </li>
          <li>
            <strong>Dados do negócio:</strong> nome, endereço público da página
            de agendamento, cidade, estado, tipo de atuação, fuso horário,
            telefone, Instagram, WhatsApp, link de mapa, textos de apresentação,
            imagem de logo e imagem de capa.
          </li>
          <li>
            <strong>Cadastro de clientes:</strong> nome, telefone, e-mail, CPF e
            data de nascimento (campos opcionais), observações, origem do
            contato, situação (ativa ou inativa) e histórico de atendimentos.
          </li>
          <li>
            <strong>Profissionais:</strong> nome, especialidade, foto (opcional),
            procedimentos que realiza e disponibilidade de horários.
          </li>
          <li>
            <strong>Procedimentos:</strong> nome, descrição, valor, duração e
            intervalo de retorno.
          </li>
          <li>
            <strong>Agendamentos:</strong> cliente, procedimento, profissional,
            data e horário, situação (por exemplo, agendado, concluído, cancelado
            ou falta) e observações.
          </li>
          <li>
            <strong>Registros financeiros:</strong> valores, situação do
            pagamento, datas, vínculo com cliente, procedimento e atendimento e
            informações de pagamentos divididos.
          </li>
          <li>
            <strong>Agendamento online:</strong> nome e telefone informados pela
            própria cliente final ao escolher um horário pela página pública. A
            partir daí, esses dados passam a integrar o cadastro do negócio
            responsável por aquela página.
          </li>
          <li>
            <strong>Comunicações:</strong> mensagens enviadas e recebidas pelo
            WhatsApp (conteúdo e tipo de mídia), telefone de origem ou destino,
            identificadores da Meta, data e hora, situação de envio, entrega e
            leitura, vínculo com a cliente e o registro de ações como a abertura
            do link de WhatsApp.
          </li>
          <li>
            <strong>Integração com a Meta (WhatsApp Business):</strong>{" "}
            identificador do número, identificador da conta comercial, número
            exibido, nome verificado, status e datas da conexão, data do último
            evento recebido e mensagem de erro, quando houver. O token de acesso
            gerado na conexão é guardado de forma cifrada.
          </li>
          <li>
            <strong>Suporte:</strong> solicitações enviadas pelo painel
            (categoria, assunto, descrição e dados de contato informados) e o
            histórico de respostas.
          </li>
          <li>
            <strong>Registros técnicos de segurança:</strong> sessão de
            autenticação e endereço IP, usado de forma transitória para limitar
            tentativas e evitar abuso (por exemplo, limite de envios e de
            tentativas de conexão).
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="finalidades" title="4. Para que usamos os dados">
        <p>
          Cada tratamento tem uma finalidade concreta dentro do produto. Usamos
          os dados para:
        </p>
        <ul>
          <li>
            <strong>Prestar o serviço contratado:</strong> autenticar usuários,
            manter o negócio e a equipe, organizar clientes, procedimentos,
            agenda e financeiro, publicar a página pública de agendamento e
            registrar os agendamentos feitos por ela.
          </li>
          <li>
            <strong>Realizar as comunicações solicitadas:</strong> preparar e
            enviar mensagens pelo WhatsApp quando o próprio usuário decide
            enviar, além de registrar o histórico dessas conversas.
          </li>
          <li>
            <strong>Gerar análises e sugestões:</strong> identificar clientes que
            podem retornar, sugerir ações e preparar textos de mensagem para
            revisão do usuário.
          </li>
          <li>
            <strong>Segurança e prevenção de abuso:</strong> controlar login e
            permissões, isolar os dados de cada negócio, limitar tentativas e
            envios e validar a autenticidade dos eventos recebidos da Meta.
          </li>
          <li>
            <strong>Atendimento:</strong> responder às solicitações abertas no
            canal de suporte do produto.
          </li>
          <li>
            <strong>Cumprir obrigações legais</strong> e exercer direitos em
            processos administrativos ou judiciais.
          </li>
        </ul>
        <p>
          As bases legais aplicáveis são, conforme o caso: execução de contrato,
          cumprimento de obrigação legal ou regulatória, legítimo interesse
          (segurança, prevenção de fraude e abuso e melhoria do serviço) e
          consentimento, quando exigido. O envio de mensagens promocionais pelo
          negócio de estética depende de consentimento ou de outra base legal
          aplicável, e essa avaliação é responsabilidade do próprio negócio.
        </p>
      </LegalSection>
      <LegalSection id="compartilhamento" title="5. Compartilhamento com terceiros">
        <p>
          Não vendemos dados pessoais e não usamos os dados das contas para
          publicidade de terceiros. Compartilhamos dados apenas com fornecedores
          necessários para operar o serviço, na medida necessária para cada
          função:
        </p>
        <ul>
          <li>
            <strong>Clerk</strong> — autenticação, cadastro e sessão de acesso.
          </li>
          <li>
            <strong>Vercel</strong> — hospedagem e entrega do site e da
            aplicação.
          </li>
          <li>
            <strong>Neon</strong> — banco de dados PostgreSQL gerenciado, onde os
            dados do produto ficam armazenados.
          </li>
          <li>
            <strong>Meta Platforms</strong> — WhatsApp Business Platform (Cloud
            API) e o fluxo oficial de conexão (Embedded Signup), usados para
            conectar o número do negócio e enviar e receber mensagens.
          </li>
          <li>
            <strong>Google</strong> — API Gemini, usada para gerar as análises e
            os textos sugeridos descritos na seção 7.
          </li>
        </ul>
        <p>
          Esses fornecedores são empresas independentes e tratam os dados de
          acordo com as próprias políticas e contratos. O uso de serviços em
          nuvem pode envolver o processamento de dados em servidores localizados
          fora do Brasil, sempre com a finalidade de operar o serviço.
        </p>
        <p>
          Dentro do EstetiQI, o acesso é restrito por papéis e os dados de um
          negócio não ficam acessíveis para outro. A equipe responsável pela
          plataforma acessa indicadores agregados (contagens de negócios,
          clientes, agendamentos e pagamentos), o nome público do negócio, a
          situação da conta e as solicitações de suporte enviadas pelo usuário.
          Esses indicadores administrativos não incluem nomes, e-mails,
          telefones, CPF ou mensagens das clientes.
        </p>
      </LegalSection>

      <LegalSection
        id="whatsapp"
        title="6. Integração com a Meta e com o WhatsApp Business"
      >
        <p>
          A conexão de um número de WhatsApp é opcional e feita pela própria
          organização, pelo fluxo oficial da Meta (Embedded Signup), dentro do
          painel do EstetiQI. Nesse processo:
        </p>
        <ul>
          <li>
            A autorização é concedida pela organização diretamente à Meta; o
            EstetiQI recebe o código de autorização, troca por um token de longa
            duração, confirma que o token realmente acessa o número informado e
            grava a integração do negócio.
          </li>
          <li>
            O token de acesso é armazenado de forma cifrada e não é devolvido em
            nenhuma resposta do sistema nem exibido na interface.
          </li>
          <li>
            As mensagens enviadas por meio da API oficial da Meta e as respostas
            recebidas pelas clientes são registradas na conta do negócio
            correspondente ao número que enviou ou recebeu a mensagem.
          </li>
          <li>
            Os eventos enviados pela Meta ao EstetiQI passam por verificação de
            assinatura antes de serem processados.
          </li>
          <li>
            Não utilizamos automação de WhatsApp Web nem qualquer meio não
            oficial: apenas a API oficial. Os limites e as regras de envio são os
            definidos pela Meta (por exemplo, janela de atendimento e uso de
            modelos aprovados).
          </li>
        </ul>
        <p>
          A organização pode desconectar o número a qualquer momento pelo painel.
          A desconexão apaga a credencial guardada e interrompe o envio pela API
          oficial.
        </p>
      </LegalSection>
      <LegalSection id="ia" title="7. Uso de inteligência artificial (Gemini)">
        <p>
          Os recursos de inteligência artificial do EstetiQI são usados para
          analisar o negócio, identificar clientes que podem retornar, sugerir
          ações e preparar textos de mensagem. Para gerar essas sugestões, o
          sistema pode enviar ao serviço Gemini, do Google, dados como: nome do
          negócio, tipo de atuação, primeiro nome da cliente, último procedimento,
          datas de atendimento, intervalo de retorno cadastrado, motivo e
          prioridade da oportunidade, contagens e valores agregados do negócio.
        </p>
        <p>
          Nenhuma mensagem é enviada automaticamente: o texto sugerido é
          apresentado ao usuário, que revisa, pode editar e decide se abre o
          WhatsApp. Quando a chave de inteligência artificial não está
          configurada, o sistema apenas monta um texto local com dados já
          existentes na conta (nome e último procedimento) e sinaliza que a
          sugestão automática está indisponível.
        </p>
      </LegalSection>

      <LegalSection id="seguranca" title="8. Armazenamento, segurança e acesso">
        <p>
          Os dados são armazenados em banco de dados gerenciado e as imagens
          enviadas (logo, capa e fotos de profissionais) ficam vinculadas ao
          negócio correspondente. Aplicamos controles proporcionais ao risco do
          produto:
        </p>
        <ul>
          <li>
            <strong>Autenticação e sessão:</strong> o acesso ao painel depende de
            autenticação e existe logout. As credenciais de acesso são tratadas
            pelo provedor de autenticação.
          </li>
          <li>
            <strong>Isolamento entre negócios:</strong> cada registro pertence a
            uma organização e as consultas são sempre restritas à organização do
            usuário autenticado, obtida no servidor a partir da sessão — nunca a
            partir de um identificador enviado pelo navegador.
          </li>
          <li>
            <strong>Permissões por papel:</strong> as ações disponíveis dependem
            do papel do usuário dentro do negócio.
          </li>
          <li>
            <strong>Credenciais da Meta:</strong> o token de acesso é cifrado
            antes de ser gravado e a chave de cifra fica fora do banco, em
            configuração do servidor. Sem a chave configurada, nenhuma credencial
            é gravada em texto puro.
          </li>
          <li>
            <strong>Tráfego:</strong> o acesso ao sistema ocorre por conexão
            cifrada (HTTPS).
          </li>
          <li>
            <strong>Limites de uso:</strong> limites de tentativas e de envios e
            registro de erros para identificar abusos e falhas.
          </li>
        </ul>
        <p>
          Nenhum sistema é totalmente imune a incidentes. Recomendamos usar senha
          forte e não compartilhar o acesso. Caso identifique qualquer uso
          indevido ou suspeita de incidente, comunique imediatamente o canal de
          privacidade.
        </p>
      </LegalSection>
      <LegalSection id="retencao" title="9. Retenção e eliminação">
        <p>
          Os dados ficam armazenados enquanto a conta do negócio estiver ativa,
          pelo tempo necessário para cumprir as finalidades descritas nesta
          política. Depois do encerramento da conta ou de um pedido de exclusão,
          os dados são eliminados ou anonimizados, ressalvadas as hipóteses em que
          a guarda for exigida por lei, para o exercício regular de direitos ou
          para a prevenção de fraude.
        </p>
        <p>
          Registros das integrações podem ser desconectados a qualquer momento
          pelo painel, o que apaga a credencial guardada. A exclusão definitiva
          dos dados pode ser solicitada pelo canal de privacidade, conforme a
          seção 11.
        </p>
      </LegalSection>

      <LegalSection id="direitos" title="10. Direitos do titular">
        <p>
          Nos termos da LGPD, o titular pode solicitar, em relação aos seus dados
          pessoais:
        </p>
        <ul>
          <li>confirmação de que existe tratamento e acesso aos dados;</li>
          <li>correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>
            anonimização, bloqueio ou eliminação de dados desnecessários,
            excessivos ou tratados em desconformidade com a lei;
          </li>
          <li>portabilidade, nos termos da regulamentação aplicável;</li>
          <li>
            informação sobre entidades com as quais os dados foram
            compartilhados;
          </li>
          <li>
            informação sobre a possibilidade de não fornecer consentimento e
            sobre as consequências disso;
          </li>
          <li>revogação do consentimento, quando o tratamento se basear nele;</li>
          <li>
            oposição a tratamentos realizados sem o seu consentimento, quando
            houver descumprimento da lei.
          </li>
        </ul>
        <p>
          Para exercer esses direitos, o titular pode usar o canal de privacidade
          indicado no item 13. Se os dados tiverem sido cadastrados por um
          negócio de estética, o pedido deve ser feito diretamente a esse negócio,
          que é o controlador desses dados. Também é possível apresentar
          reclamação à Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </LegalSection>
      <LegalSection
        id="exclusao-de-dados"
        title="11. Como solicitar a exclusão de dados"
      >
        <p>Para solicitar a exclusão de dados, o procedimento é:</p>
        <ul>
          <li>
            <strong>Desconectar a integração, se houver:</strong> no painel, na
            área de comunicações, abra a seção de configurações do WhatsApp e use
            a opção de desconectar. A credencial guardada é apagada e o envio pela
            API oficial é interrompido.
          </li>
          <li>
            <strong>Enviar o pedido:</strong> escreva para o canal de privacidade
            indicado no item 13, informando o nome do negócio e o e-mail
            cadastrado, para que possamos identificar a conta com segurança.
          </li>
          <li>
            <strong>Confirmação e execução:</strong> confirmamos o recebimento e
            informamos o andamento. A exclusão abrange os dados da conta, os
            cadastros, os agendamentos, os registros financeiros, as mensagens
            armazenadas e os registros da integração, ressalvadas as informações
            que devam ser mantidas por obrigação legal.
          </li>
          <li>
            <strong>Dados recebidos por integração:</strong> mensagens e eventos
            recebidos pela conexão com a Meta são apagados pelo mesmo
            procedimento. A autorização do aplicativo também pode ser revogada
            pela própria conta na Meta, nas configurações de aplicativos e sites.
          </li>
          <li>
            <strong>Pedidos de clientes finais:</strong> quando a solicitação vier
            de uma cliente de um negócio de estética, ela é encaminhada ao
            negócio responsável pelo cadastro ou atendida em conjunto com ele.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="cookies" title="12. Cookies e tecnologias semelhantes">
        <ul>
          <li>
            <strong>Cookies essenciais de sessão:</strong> usados pelo provedor de
            autenticação para manter o login e proteger o acesso ao painel. Sem
            eles, não é possível entrar no sistema.
          </li>
          <li>
            <strong>Armazenamento local do navegador:</strong> usamos armazenamento
            local do navegador apenas para guardar rascunhos de formulários
            enquanto o usuário preenche uma tela (por exemplo, um agendamento em
            andamento). Esse conteúdo permanece no próprio dispositivo e não é
            usado para rastreamento.
          </li>
          <li>
            <strong>Sem rastreamento publicitário:</strong> não utilizamos cookies
            de publicidade nem ferramentas de análise de audiência de terceiros
            nas páginas do produto.
          </li>
        </ul>
        <p>
          O usuário pode bloquear ou apagar cookies nas configurações do
          navegador, mas isso pode impedir o login e o funcionamento do painel.
        </p>
      </LegalSection>

      <LegalSection id="alteracoes" title="13. Alterações e contato">
        <p>
          Esta política pode ser atualizada para refletir mudanças no produto, na
          legislação ou nos fornecedores utilizados. A data da última atualização
          é indicada no início do documento. Alterações relevantes serão
          comunicadas pelos canais do produto.
        </p>
        <p>
          Dúvidas, solicitações e reclamações relacionadas a dados pessoais podem
          ser enviadas para{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
