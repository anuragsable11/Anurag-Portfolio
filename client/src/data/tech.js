import {
  SiCelery,
  SiCss,
  SiDjango,
  SiDocker,
  SiFastapi,
  SiFlask,
  SiGit,
  SiHtml5,
  SiHuggingface,
  SiJavascript,
  SiMysql,
  SiOllama,
  SiPostgresql,
  SiPostman,
  SiPython,
  SiPytorch,
  SiRedis,
  SiSqlite,
  SiTensorflow,
} from 'react-icons/si'
import { RiChatAi3Fill } from 'react-icons/ri'

/**
 * Logos shown as app-icon tiles in the skills section.
 *
 * `color` is the brand colour the logo is drawn in on its dark tile; null
 * draws it white. A logo that is itself a filled square (JavaScript, CSS,
 * Celery) also sets `knockout`: it fills the whole tile, and the knockout
 * colour shows through its cut-outs.
 *
 * `group` is the kind of skill, which sets the samurai's mood while the
 * visitor plays with that icon (see lib/companion.js).
 */
export const TECH = [
  { name: 'Python', Icon: SiPython, color: '#4B8BBE', group: 'backend' },
  { name: 'Django', Icon: SiDjango, color: '#44B78B', group: 'backend' },
  { name: 'FastAPI', Icon: SiFastapi, color: '#05998B', group: 'backend' },
  { name: 'Flask', Icon: SiFlask, color: null, group: 'backend' },
  { name: 'Celery', Icon: SiCelery, color: '#37814A', knockout: '#ffffff', group: 'backend' },
  { name: 'Redis', Icon: SiRedis, color: '#FF4438', group: 'backend' },
  { name: 'PostgreSQL', Icon: SiPostgresql, color: '#4169E1', group: 'data' },
  { name: 'MySQL', Icon: SiMysql, color: '#4479A1', group: 'data' },
  { name: 'SQLite', Icon: SiSqlite, color: '#0F80CC', group: 'data' },
  { name: 'Ollama', Icon: SiOllama, color: null, group: 'ai' },
  { name: 'Hugging Face', Icon: SiHuggingface, color: '#FFD21E', group: 'ai' },
  { name: 'PyTorch', Icon: SiPytorch, color: '#EE4C2C', group: 'ai' },
  { name: 'TensorFlow', Icon: SiTensorflow, color: '#FF6F00', group: 'ai' },
  // No brand mark exists, so a chat bubble with an AI spark stands in.
  { name: 'Prompt Engineering', Icon: RiChatAi3Fill, color: '#A78BFA', group: 'ai' },
  { name: 'Docker', Icon: SiDocker, color: '#2496ED', group: 'tools' },
  { name: 'Git', Icon: SiGit, color: '#F05032', group: 'tools' },
  { name: 'Postman', Icon: SiPostman, color: '#FF6C37', group: 'tools' },
  { name: 'JavaScript', Icon: SiJavascript, color: '#F7DF1E', knockout: '#18181b', group: 'web' },
  { name: 'HTML5', Icon: SiHtml5, color: '#E34F26', group: 'web' },
  { name: 'CSS', Icon: SiCss, color: '#2965F1', knockout: '#ffffff', group: 'web' },
]
