# Status atual e possibilidades futuras

Este documento registra o que o prototipo do Editor de Planta Baixa / IFC ja consegue fazer e quais evolucoes podem ser desenvolvidas a partir da base atual.

## Estado atual

O projeto possui uma base funcional em HTML, CSS e JavaScript, usando Vite e PDF.js para carregar e renderizar a planta em PDF.

A arquitetura foi reorganizada para separar responsabilidades em modulos:

- `src/main.js`: orquestracao geral, eventos, PDF.js e estado principal.
- `src/core`: utilidades de DOM, logs, matematica e coordenadas.
- `src/selection`: geometria da selecao.
- `src/ifc`: carregamento, parsing e busca de entidades IFC.
- `src/annotations`: criacao, atualizacao, exclusao e renderizacao de anotacoes.
- `src/persistence`: salvamento e restauracao local do estado.
- `src/ui`: renderizacao do painel de selecao.

## Visualizador PDF

O visualizador permite:

- carregar o PDF da planta;
- renderizar a pagina em canvas;
- navegar entre paginas quando existirem;
- aplicar zoom pelos botoes;
- aplicar zoom com `Ctrl + scroll`;
- manter o ponto do cursor durante o zoom;
- mover a planta por pan com o mouse;
- mover a planta pela roda do mouse;
- ampliar com duplo clique;
- centralizar e resetar a visualizacao.

O sistema preserva o controle de concorrencia do PDF.js:

- cancela renderizacoes antigas;
- agenda renderizacoes pelo frame mais recente;
- evita que uma renderizacao antiga substitua uma nova;
- trata cancelamento esperado sem mascarar erros reais.

## Selecao por area

A selecao por area esta implementada por modo de interacao.

O usuario pode alternar entre:

- `Mover`: comportamento de pan da planta.
- `Selecionar`: cria uma area retangular sobre a planta.

A selecao:

- nasce com clique e arraste;
- fica visivel como retangulo pontilhado;
- permanece ativa depois do mouse soltar;
- pode ser removida pelo botao de fechar ou pela tecla `Escape`;
- e armazenada em coordenadas PDF, nao em pixels absolutos da tela.

Isso permite que a selecao continue associada a mesma regiao da planta mesmo apos zoom, pan e centralizacao.

## IFC

O sistema carrega o arquivo IFC local e faz um parsing leve do STEP.

Atualmente ele consegue:

- identificar o schema do arquivo IFC;
- identificar unidade de comprimento;
- indexar entidades IFC por tipo;
- listar produtos IFC relevantes;
- extrair dados basicos como `stepId`, tipo, nome, `GlobalId`, descricao e `ObjectType`;
- resolver referencias basicas entre entidades;
- extrair pontos de geometria e footprints quando disponiveis;
- calcular envelopes geometricos aproximados das entidades;
- calcular o envelope geral do modelo;
- mapear automaticamente o envelope IFC para o espaco da pagina PDF;
- listar entidades IFC que intersectam a area selecionada.

A busca espacial atual usa calibracao automatica por envelope geral IFC -> PDF. Isso permite uso imediato, mas ainda nao substitui uma calibracao precisa baseada em pontos reais de controle.

## Anotacoes e textos

O sistema permite inserir textos associados a uma area selecionada.

As anotacoes:

- sao criadas a partir da selecao ativa;
- aparecem como texto aplicado sobre a planta;
- podem ser selecionadas novamente;
- podem ser editadas pelo painel;
- podem ser apagadas;
- podem ser movidas sobre a planta;
- continuam posicionadas corretamente com zoom e pan.

O texto nao fica apenas como uma caixa externa de UI. Ele e renderizado dentro da area visual da planta, em uma camada de anotacoes sobre o PDF.

## Persistencia

O sistema possui persistencia local usando `localStorage`.

Atualmente e possivel:

- salvar o projeto localmente;
- restaurar o projeto salvo;
- limpar o projeto local;
- preservar pagina, zoom, pan, selecao ativa e anotacoes.

Essa persistencia e adequada para prototipo local. Para uso real, ainda sera necessario definir um formato de projeto mais robusto e exportavel.

## Limitacoes atuais

A base ja funciona como prototipo, mas ainda possui limitacoes importantes:

- a calibracao IFC/PDF e automatica e aproximada;
- nao existe ferramenta visual para alinhar IFC e PDF manualmente;
- a geometria IFC e extraida de forma leve, sem engine BIM completa;
- o sistema ainda nao renderiza o IFC como camada grafica independente;
- as entidades IFC encontradas sao listadas, mas ainda nao podem ser editadas;
- nao ha historico de alteracoes, undo ou redo;
- nao ha exportacao de anotacoes para PDF ou outro formato;
- a persistencia ainda fica restrita ao navegador atual.

## Possibilidades futuras

A partir da base atual, o sistema pode evoluir para:

- calibracao manual entre PDF e IFC com pontos de referencia;
- ajuste de escala, origem, rotacao e espelhamento entre as camadas;
- visualizacao do IFC como overlay sobre a planta;
- destaque grafico das entidades IFC encontradas na selecao;
- filtros por categoria IFC;
- painel detalhado de propriedades IFC;
- selecao direta de entidades IFC no canvas;
- associacao manual entre anotacoes, areas e entidades IFC;
- multiplas selecoes simultaneas;
- areas nomeadas;
- classificacao de areas;
- medicoes e cotas;
- desenho de linhas, poligonos e marcacoes;
- edicao avancada de textos;
- historico de alteracoes;
- undo e redo;
- salvar o projeto em arquivo JSON;
- importar um projeto salvo;
- exportar anotacoes e selecoes;
- gerar relatorios por area selecionada;
- gerar relatorios por entidade IFC;
- exportar uma prancha anotada;
- integrar com banco de dados;
- integrar com sistemas BIM;
- trabalhar com multiplos PDFs e multiplos IFCs.

## Proxima evolucao recomendada

O proximo passo tecnico mais importante e criar uma etapa de calibracao PDF/IFC.

Essa etapa deveria permitir ao usuario informar pontos equivalentes entre a planta PDF e o modelo IFC. Com isso, o sistema poderia substituir a calibracao automatica atual por uma transformacao espacial real.

Depois disso, a selecao por area podera identificar entidades com muito mais precisao e o overlay IFC podera ser desenhado sobre a planta com confianca.
