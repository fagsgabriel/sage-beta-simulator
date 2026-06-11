#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("sage-beta-simulator")
  .description("Simulador de usuários beta para a API do Sage")
  .version("0.1.0");

program.parse();
