# AGENTS.md

# Pitá Arquitetura — Editor de Planta Baixa / IFC

## 1. Objetivo do projeto

Este projeto pertence à **Pitá Arquitetura - Okn** e consiste em um projeto experimental para estudar o que é possível desenvolver a partir de:

- um **PDF vetorizado de uma planta arquitetônica**;
- um arquivo **IFC (Industry Foundation Classes)** sobreposto à planta;
- HTML, CSS e JavaScript como stack inicial.

O objetivo é criar um sistema capaz de:

- visualizar a planta;
- interagir com a planta;
- selecionar áreas;
- identificar entidades existentes dentro de áreas selecionadas;
- exibir as entidades encontradas em uma área separada da interface;
- editar informações;
- inserir textos;
- editar textos;
- apagar textos/anotações;
- movimentar elementos quando aplicável;
- trabalhar com elementos do IFC;
- salvar e restaurar o estado do projeto;
- futuramente implementar histórico e Undo/Redo;
- documentar completamente o funcionamento e as possibilidades futuras do sistema.

Este é inicialmente um **projeto de estudo/prova de conceito**, mas deve ser desenvolvido com arquitetura suficientemente organizada para servir como base para uma futura versão real.

---

# 2. Stack inicial

A implementação inicial deve utilizar:

- HTML
- CSS
- JavaScript

Não adicionar frameworks ou bibliotecas sem necessidade técnica real.

Quando uma biblioteca for necessária, verificar primeiro se já existe alguma dependência adequada no projeto.

---

# 3. Arquivos de referência

Os arquivos fornecidos para o projeto incluem:

- `2024-000_Pitá-Edifício Itália_R01.ifc`
- `2024-000_Pitá-Edifício Itália_R01_LAYOUT.pdf`
- `2024-000_Pitá-Edifício Itália_R01_ZONAS ISOLADAS.pdf`

O PDF vetorizado é utilizado como base gráfica.

O IFC será utilizado como fonte de entidades, geometria e propriedades.

Não assumir que os arquivos possuem a mesma:

- escala;
- origem;
- orientação;
- unidade;
- posição;
- referência espacial.

Essas informações devem ser verificadas durante a implementação.

---

# 4. Objetivos funcionais

O sistema deverá evoluir para permitir:

## Visualização

- visualizar o PDF;
- navegar entre páginas quando aplicável;
- zoom in;
- zoom out;
- zoom com mouse;
- zoom mantendo o ponto do cursor;
- arrastar a planta com o zoom aplicado;
- visualizar outras áreas da planta;
- centralizar;
- resetar a visualização.

## Seleção

O usuário deverá conseguir:

- clicar e segurar o botão esquerdo do mouse;
- arrastar;
- criar uma área de seleção;
- visualizar o retângulo da seleção;
- manter a seleção ativa quando necessário;
- clicar fora para fechar/remover a seleção.

## Entidades

Quando existir alguma entidade dentro da área selecionada:

- identificar a entidade;
- listar o que existe dentro da área;
- exibir as informações em um campo separado;
- permitir futura interação com essas entidades.

Quando não existir nenhuma entidade:

- manter o quadrado/retângulo pontilhado;
- manter a área selecionada;
- permitir inserir informações/anotações;
- remover a seleção somente quando o usuário clicar fora dela.

## Textos e anotações

Em áreas selecionadas deverá ser possível futuramente:

- inserir texto;
- editar texto;
- mover texto;
- apagar texto;
- selecionar novamente um texto existente;
- editar uma anotação existente.

---

# 5. Regra de não redundância

## MUITO IMPORTANTE

O Codex deve evitar produção e processamento desnecessários.

Não repetir informações que já estejam:

- neste `AGENTS.md`;
- na documentação do projeto;
- no código;
- em decisões já registradas;
- em etapas já concluídas.

Antes de realizar uma tarefa:

1. consultar o contexto existente;
2. verificar o que já foi implementado;
3. verificar o que já foi documentado;
4. identificar exatamente o que falta;
5. trabalhar somente no que é necessário.

### Não fazer

Não:

- recriar uma funcionalidade já existente;
- criar arquivos duplicados para a mesma responsabilidade;
- criar funções que fazem exatamente a mesma coisa;
- instalar dependências que já estão instaladas;
- repetir explicações técnicas longas quando a informação já está documentada;
- reanalisar arquivos que já foram analisados sem motivo;
- refazer uma etapa concluída sem necessidade;
- gerar documentação duplicada;
- modificar arquivos que não participam da tarefa;
- refatorar código funcional apenas para reorganizá-lo.

### Antes de criar algo

Perguntar ao próprio contexto do projeto:

```text
Isso já existe?
Isso já foi implementado?
Isso já está documentado?
Existe uma função/módulo que já resolve isso?
Posso reutilizar o que já existe?
```

Se a resposta for sim, reutilizar.

### Regra prática

> **Não gastar tokens, processamento ou tempo repetindo trabalho que o projeto já possui.**

Sempre preferir:

```text
Reutilizar > Adaptar > Criar
```

e:

```text
Alteração pequena > Refatoração grande
```

---

# 6. Estado atual do projeto

A análise inicial dos arquivos já foi realizada.

A **Fase 1 do planejamento/análise** está concluída.

A **Fase 1 do visualizador** também está concluída e funcional.

Portanto, o desenvolvimento atual deve continuar **a partir da próxima etapa**, sem reconstruir o que já existe.

---

# 7. Histórico das fases

O projeto está organizado em:

```text
Fase 1 — Planejamento e análise dos arquivos
Fase 2 — Fase 1: Visualizador
Fase 3 — Fase 2: Seleção
Fase 4 — Fase 3: IFC
Fase 5 — Fase 4: Edição
Fase 6 — Fase 5: Persistência
Fase 7 — Documentação
```

---

# 8. Fase 1 — Planejamento e análise dos arquivos

## Status

**CONCLUÍDA**

Objetivos:

- analisar PDF;
- analisar IFC;
- entender arquivos;
- definir requisitos;
- definir arquitetura inicial;
- definir fluxo do projeto;
- preparar estrutura de desenvolvimento.

Essa etapa não deve ser refeita sem uma necessidade específica.

---

# 9. Fase 2 — Fase 1: Visualizador

## Status

**CONCLUÍDA**

Essa fase corresponde ao visualizador atualmente funcional.

Foi implementado:

- estrutura inicial;
- carregamento do PDF;
- PDF.js;
- renderização no `<canvas>`;
- zoom pelos botões;
- zoom com `Ctrl + scroll`;
- zoom mantendo o ponto do cursor;
- pan com mouse;
- pan pela roda;
- duplo clique para zoom;
- centralização;
- reset da visualização;
- paginação preparada;
- controle de concorrência das renderizações;
- cancelamento de renderizações anteriores.

### Problema importante já corrigido

Foi identificado um problema em que um `Ctrl + scroll` muito rápido provocava:

- canvas preto;
- erros no console;
- renderizações concorrentes;
- UI sem acompanhar corretamente o zoom.

Esse problema foi corrigido através do controle de concorrência e cancelamento das renderizações.

**Não remover ou simplificar essa proteção.**

Qualquer alteração no sistema de renderização deve preservar:

```text
renderização atual
        ↓
nova solicitação
        ↓
cancelar/invalidar renderização anterior
        ↓
renderizar somente o estado mais recente
```

---

# 10. Fase 3 — Fase 2: Seleção

## Status

**PRÓXIMA FASE / EM DESENVOLVIMENTO**

Esta é a fase atual.

Objetivos:

### Seleção por área

Permitir:

- clicar e segurar botão esquerdo;
- arrastar o mouse;
- criar retângulo de seleção;
- visualizar claramente a área selecionada;
- manter o retângulo enquanto a seleção estiver ativa;
- clicar fora para remover/fechar a seleção.

### Coordenadas

A seleção deve funcionar corretamente independente de:

- zoom;
- pan;
- posição do canvas;
- escala;
- tamanho da janela.

Nunca armazenar uma seleção apenas como coordenadas de tela.

Preferir um sistema de coordenadas estável.

Conceitualmente:

```text
Mouse / Screen
      ↓
Canvas
      ↓
Viewport
      ↓
PDF
```

No futuro:

```text
PDF
 ↓
Transformação espacial
 ↓
IFC
```

### Entidades encontradas

Após selecionar uma área:

```text
Área selecionada
       ↓
Pesquisar entidades
       ↓
Existem entidades?
   ↙          ↘
 SIM          NÃO
 ↓             ↓
Listar         Manter seleção
entidades      pontilhada
 ↓             ↓
Campo          Permitir
separado       anotações
```

O sistema deve futuramente conseguir determinar quais elementos do IFC estão dentro/intersectam a região selecionada.

### Seleção vazia

Se não houver nenhuma entidade:

- manter o retângulo pontilhado;
- manter a área selecionada;
- permitir inserção de texto/anotação;
- não remover automaticamente;
- remover quando o usuário clicar fora.

---

# 11. Fase 4 — Fase 3: IFC

## Status

**A DESENVOLVER**

Objetivos:

- carregamento do IFC;
- parsing;
- identificação das entidades;
- identificação das categorias;
- leitura de propriedades;
- leitura de geometria;
- preparação dos dados para integração com a planta;
- relacionamento entre entidades e áreas.

Antes de implementar:

1. Inspecionar o IFC real.
2. Identificar entidades existentes.
3. Identificar propriedades relevantes.
4. Identificar unidades.
5. Identificar coordenadas.
6. Identificar orientação.
7. Identificar origem.
8. Identificar informações necessárias para o alinhamento com o PDF.

Não inventar propriedades ou entidades.

---

# 12. Fase 5 — Fase 4: Edição

## Status

**A DESENVOLVER**

Objetivos:

- inserir textos;
- editar textos;
- apagar textos;
- movimentar textos;
- criar anotações;
- selecionar novamente objetos existentes;
- editar informações de áreas;
- permitir alterações nos elementos quando tecnicamente possível.

As operações de edição devem respeitar a seleção atual.

Quando um objeto for selecionado:

```text
Selecionado
    ↓
Exibir propriedades
    ↓
Editar
    ↓
Salvar alteração
```

Quando for apagado:

```text
Selecionado
    ↓
Excluir
    ↓
Atualizar visualização
```

---

# 13. Fase 6 — Fase 5: Persistência

## Status

**A DESENVOLVER**

Objetivos:

- salvar projeto;
- carregar projeto;
- preservar estado;
- preservar áreas selecionadas;
- preservar textos;
- preservar anotações;
- preservar associações;
- histórico de alterações;
- Undo;
- Redo.

O formato de persistência deverá ser definido quando houver dados suficientes para representar o estado real da aplicação.

Evitar criar um sistema de persistência complexo antes de saber exatamente quais dados precisarão ser salvos.

---

# 14. Fase 7 — Documentação

## Status

**A DESENVOLVER**

A documentação deverá registrar:

### Documentação técnica

- arquitetura;
- estrutura de pastas;
- responsabilidades dos arquivos;
- fluxo da aplicação;
- PDF.js;
- renderização;
- zoom;
- pan;
- coordenadas;
- seleção;
- IFC;
- edição;
- persistência.

### Funcionalidades

Documentar:

- o que o sistema faz;
- como cada recurso funciona;
- limitações;
- decisões técnicas.

### Área selecionada

Documentar tudo que pode ser feito com uma área:

- selecionar;
- identificar entidades;
- visualizar propriedades;
- inserir texto;
- editar;
- excluir;
- adicionar anotações;
- relacionar elementos;
- futuras operações.

### Futuro

Documentar funcionalidades que poderão ser desenvolvidas posteriormente.

---

# 15. Sistema de coordenadas

Este é um dos pontos mais críticos do projeto.

Nunca assumir:

```javascript
mouseX === pdfX;
mouseY === pdfY;
```

Isso normalmente não será verdade.

A aplicação precisa considerar:

- zoom;
- pan;
- canvas;
- viewport;
- escala;
- posição do canvas;
- página;
- transformação espacial.

O fluxo deve ser conceitualmente:

```text
Screen Coordinates
        ↓
Canvas Coordinates
        ↓
Viewport Coordinates
        ↓
PDF Coordinates
        ↓
IFC Coordinates
```

A transformação entre PDF e IFC deverá ser descoberta com base nos dados reais dos arquivos.

Não utilizar offsets, escalas ou rotações arbitrárias sem entender e documentar a razão.

---

# 16. PDF e IFC como camadas

A arquitetura deverá manter o PDF e o IFC separados.

Conceitualmente:

```text
┌───────────────────────────────┐
│ Interface / Controles         │
├───────────────────────────────┤
│ Seleções / Anotações          │
├───────────────────────────────┤
│ Overlay IFC                   │
├───────────────────────────────┤
│ PDF                           │
├───────────────────────────────┤
│ Fundo                         │
└───────────────────────────────┘
```

Não misturar a lógica do PDF com a lógica do IFC.

A seleção deverá funcionar como uma camada de interação independente.

---

# 17. Renderização e concorrência

A renderização PDF.js é assíncrona.

Nunca permitir que uma renderização antiga substitua uma renderização nova.

Toda alteração que envolva:

- zoom;
- página;
- escala;
- resize;
- redraw;

deve considerar concorrência.

Manter o mecanismo atual de:

- cancelamento;
- controle de renderização;
- identificação da renderização válida;
- proteção contra estados antigos.

---

# 18. Zoom e pan

Qualquer funcionalidade adicionada deve continuar funcionando com:

- zoom;
- pan;
- centralização;
- reset;
- seleção.

Exemplo:

```text
Selecionar área
      ↓
Zoom
      ↓
Seleção continua no lugar correto
```

e:

```text
Selecionar área
      ↓
Pan
      ↓
Seleção continua associada à mesma região
```

A seleção nunca deve ficar presa a pixels absolutos da tela.

---

# 19. Interação do mouse

Diferenciar corretamente:

- clique;
- clique e arrasto;
- pan;
- seleção;
- duplo clique;
- `Ctrl + scroll`;
- scroll normal.

Ao implementar seleção, não quebrar:

- pan;
- zoom;
- duplo clique.

Uma interação nova deve coexistir com as existentes.

---

# 20. Performance

Evitar:

- renderizações desnecessárias;
- loops pesados durante `mousemove`;
- criação excessiva de elementos DOM;
- processamento repetido;
- buscas repetidas nas entidades;
- cálculos duplicados.

Para eventos de alta frequência, considerar:

- `requestAnimationFrame`;
- throttling;
- debouncing;
- cache;
- cancelamento.

Porém:

> **Não otimizar algo que ainda não demonstrou ser um problema.**

Primeiro garantir correção.

---

# 21. Logs

Manter logs úteis para:

- inicialização;
- carregamento;
- renderização;
- cancelamento;
- página;
- zoom;
- seleção;
- entidades;
- erros.

Evitar logs excessivos dentro de eventos de alta frequência.

Não remover logs importantes sem motivo.

---

# 22. Tratamento de erros

Todo erro relevante deve ser tratado.

Não utilizar:

```javascript
catch {}
```

Diferenciar:

```text
cancelamento esperado
```

de:

```text
erro real
```

Não esconder erros de renderização ou processamento.

---

# 23. Estrutura e organização

Antes de criar um arquivo:

1. Verificar se já existe um arquivo com essa responsabilidade.
2. Verificar se a funcionalidade pode ser adicionada ao módulo existente.
3. Verificar se existe código duplicado.
4. Reutilizar código quando possível.

Não criar:

```text
selection.js
selectionManager.js
areaSelection.js
areaManager.js
selectionController.js
```

se apenas um módulo realmente for necessário.

A estrutura deve refletir responsabilidades reais, não uma tentativa de parecer "arquiteturalmente sofisticada".

---

# 24. Regra de alterações

Ao modificar um arquivo:

- preservar o código existente;
- preservar funcionalidades;
- alterar somente o necessário;
- manter estrutura quando possível;
- não remover código sem justificativa;
- não refatorar sem necessidade.

Se o arquivo precisar ser apresentado ao usuário, apresentar o **arquivo completo**, incluindo as alterações.

Nunca enviar somente um trecho quando a intenção for substituir o arquivo inteiro.

---

# 25. Processo de desenvolvimento

Antes de implementar:

## 1. Inspecionar

Verificar:

- estrutura;
- arquivos;
- código;
- dependências;
- estado atual.

## 2. Identificar

Determinar:

- o que já existe;
- o que falta;
- onde a nova funcionalidade deve entrar.

## 3. Planejar

Definir:

- arquivos envolvidos;
- funções;
- eventos;
- estados;
- impactos.

## 4. Implementar

Fazer a menor alteração possível.

## 5. Testar

Testar:

- funcionalidade nova;
- funcionalidades antigas;
- console;
- zoom;
- pan;
- seleção;
- renderização.

## 6. Corrigir

Corrigir qualquer regressão antes de avançar.

---

# 26. Regra de continuidade entre fases

Cada fase deve entregar uma base funcional para a próxima.

Não avançar para a próxima fase deixando a anterior quebrada.

Fluxo:

```text
Fase concluída
      ↓
Validar
      ↓
Preservar
      ↓
Adicionar próxima funcionalidade
```

Não fazer:

```text
Fase 2 quebra Fase 1
      ↓
Ignorar
      ↓
Continuar para Fase 3
```

---

# 27. Funcionalidades futuras possíveis

Depois das fases principais, poderão ser estudadas funcionalidades como:

- múltiplas áreas;
- edição avançada;
- propriedades detalhadas;
- filtros IFC;
- seleção por categoria;
- isolamento de entidades;
- destaque de elementos;
- medição;
- cotas;
- ferramentas de desenho;
- linhas;
- polígonos;
- marcações;
- comentários;
- classificação de áreas;
- exportação;
- importação;
- compartilhamento;
- histórico avançado;
- colaboração;
- integração com bancos de dados;
- integração com sistemas BIM;
- análise espacial;
- relatórios.

Essas funcionalidades são **possibilidades futuras**, não devem ser implementadas antecipadamente sem solicitação.

---

# 28. O que não fazer

Não:

- reconstruir o projeto sem necessidade;
- trocar a stack sem necessidade;
- adicionar framework apenas por preferência;
- instalar bibliotecas desnecessárias;
- criar arquivos duplicados;
- duplicar funções;
- duplicar documentação;
- repetir análises já concluídas;
- reimplementar funcionalidades existentes;
- apagar código funcional;
- alterar arquitetura sem necessidade;
- criar abstrações excessivas;
- ignorar problemas de coordenadas;
- usar coordenadas fixas da tela para armazenar geometria;
- quebrar zoom;
- quebrar pan;
- quebrar renderização;
- ignorar concorrência;
- mascarar erros;
- implementar fases futuras antes da hora.

---

# 29. Regra de prioridade

Ao tomar decisões técnicas, seguir:

```text
1. Correção
2. Preservação do que já funciona
3. Estabilidade
4. Consistência espacial
5. Simplicidade
6. Performance
7. Organização
8. Novas funcionalidades
9. Refinamento visual
```

---

# 30. Regra principal do projeto

> **Não quebrar o que funciona, não criar o que já existe e não gastar processamento/tokens repetindo trabalho desnecessário.**

O projeto deve evoluir incrementalmente:

```text
Analisar
   ↓
Entender
   ↓
Reutilizar
   ↓
Implementar
   ↓
Testar
   ↓
Documentar
   ↓
Avançar
```

Cada nova funcionalidade deve ser construída sobre a anterior.

**Não reconstruir. Não duplicar. Não presumir. Não inventar. Implementar, validar e avançar.**
