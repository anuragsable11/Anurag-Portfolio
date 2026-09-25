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

/** Logos shown in the skills cloud. `color: null` means follow the theme. */
export const TECH = [
  { name: 'Python', Icon: SiPython, color: '#3776AB' },
  { name: 'Django', Icon: SiDjango, color: '#2BA977' },
  { name: 'FastAPI', Icon: SiFastapi, color: '#009688' },
  { name: 'Flask', Icon: SiFlask, color: null },
  { name: 'Celery', Icon: SiCelery, color: '#37814A' },
  { name: 'Redis', Icon: SiRedis, color: '#E8412F' },
  { name: 'PostgreSQL', Icon: SiPostgresql, color: '#4169E1' },
  { name: 'MySQL', Icon: SiMysql, color: '#0E7490' },
  { name: 'SQLite', Icon: SiSqlite, color: '#1A7FB5' },
  { name: 'Ollama', Icon: SiOllama, color: null },
  { name: 'Hugging Face', Icon: SiHuggingface, color: '#F5B400' },
  { name: 'PyTorch', Icon: SiPytorch, color: '#EE4C2C' },
  { name: 'TensorFlow', Icon: SiTensorflow, color: '#FF6F00' },
  // No brand mark exists, so a chat bubble with an AI spark stands in. It is
  // a filled icon, so it extrudes into 3D like the logos do.
  { name: 'Prompt Engineering', Icon: RiChatAi3Fill, color: '#8B5CF6' },
  { name: 'Docker', Icon: SiDocker, color: '#2496ED' },
  { name: 'Git', Icon: SiGit, color: '#E44C30' },
  { name: 'Postman', Icon: SiPostman, color: '#F0642A' },
  { name: 'JavaScript', Icon: SiJavascript, color: '#B8940F' },
  { name: 'HTML5', Icon: SiHtml5, color: '#E34F26' },
  { name: 'CSS', Icon: SiCss, color: '#2965F1' },
]
