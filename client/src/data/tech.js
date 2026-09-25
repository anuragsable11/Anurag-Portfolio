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
 */
export const TECH = [
  { name: 'Python', Icon: SiPython, color: '#4B8BBE' },
  { name: 'Django', Icon: SiDjango, color: '#44B78B' },
  { name: 'FastAPI', Icon: SiFastapi, color: '#05998B' },
  { name: 'Flask', Icon: SiFlask, color: null },
  { name: 'Celery', Icon: SiCelery, color: '#37814A', knockout: '#ffffff' },
  { name: 'Redis', Icon: SiRedis, color: '#FF4438' },
  { name: 'PostgreSQL', Icon: SiPostgresql, color: '#4169E1' },
  { name: 'MySQL', Icon: SiMysql, color: '#4479A1' },
  { name: 'SQLite', Icon: SiSqlite, color: '#0F80CC' },
  { name: 'Ollama', Icon: SiOllama, color: null },
  { name: 'Hugging Face', Icon: SiHuggingface, color: '#FFD21E' },
  { name: 'PyTorch', Icon: SiPytorch, color: '#EE4C2C' },
  { name: 'TensorFlow', Icon: SiTensorflow, color: '#FF6F00' },
  // No brand mark exists, so a chat bubble with an AI spark stands in.
  { name: 'Prompt Engineering', Icon: RiChatAi3Fill, color: '#A78BFA' },
  { name: 'Docker', Icon: SiDocker, color: '#2496ED' },
  { name: 'Git', Icon: SiGit, color: '#F05032' },
  { name: 'Postman', Icon: SiPostman, color: '#FF6C37' },
  { name: 'JavaScript', Icon: SiJavascript, color: '#F7DF1E', knockout: '#18181b' },
  { name: 'HTML5', Icon: SiHtml5, color: '#E34F26' },
  { name: 'CSS', Icon: SiCss, color: '#2965F1', knockout: '#ffffff' },
]
