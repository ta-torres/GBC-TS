import type { CPU } from "../cpu";
import type { AddressBus } from "../../memory/addressBus";

export const getRegister = (
  cpu: CPU,
  bus: AddressBus,
  index: number,
): number => {
  switch (index) {
    case 0:
      return cpu.registers.getB();
    case 1:
      return cpu.registers.getC();
    case 2:
      return cpu.registers.getD();
    case 3:
      return cpu.registers.getE();
    case 4:
      return cpu.registers.getH();
    case 5:
      return cpu.registers.getL();
    case 6:
      return bus.read(cpu.registers.getHL());
    case 7:
      return cpu.registers.getA();
    default:
      throw new Error(`Invalid register index: ${index}`);
  }
};

export const setRegister = (
  cpu: CPU,
  bus: AddressBus,
  index: number,
  value: number,
): void => {
  value &= 0xff;
  switch (index) {
    case 0:
      cpu.registers.setB(value);
      break;
    case 1:
      cpu.registers.setC(value);
      break;
    case 2:
      cpu.registers.setD(value);
      break;
    case 3:
      cpu.registers.setE(value);
      break;
    case 4:
      cpu.registers.setH(value);
      break;
    case 5:
      cpu.registers.setL(value);
      break;
    case 6:
      bus.write(cpu.registers.getHL(), value);
      break;
    case 7:
      cpu.registers.setA(value);
      break;
    default:
      throw new Error(`Invalid register index: ${index}`);
  }
};

export const REGISTER_NAMES = ["B", "C", "D", "E", "H", "L", "(HL)", "A"];
