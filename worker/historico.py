"""Leva as ofertas para o histórico por período e apaga da tabela do dia o que é antigo (migração 0019).

Se o produto, no mesmo mercado, tem o mesmo preço do dia anterior, o histórico não ganha linha nova:
o período só é esticado. Roda depois da coleta, todo dia.

Uso:
    python historico.py              # consolida até ontem e mantém 7 dias em `oferta`
    python historico.py --manter 10  # mantém 10 dias
    python historico.py --so-consolidar
"""
import argparse

from rodar_coleta import conectar, tentar


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--manter", type=int, default=7, help="dias que ficam na tabela do dia (mínimo 3)")
    ap.add_argument("--so-consolidar", action="store_true", help="não apaga nada de `oferta`")
    a = ap.parse_args(argv)

    db = conectar()
    n = tentar(lambda: db.rpc("consolidar_ofertas", {}).execute().data)
    controle = db.table("historico_controle").select("ultimo_dia").eq("id", 1).execute().data
    print(f"histórico: {n} linhas esticadas ou criadas; consolidado até {controle[0]['ultimo_dia'] if controle else '?'}")
    if a.so_consolidar:
        return
    apagadas = tentar(lambda: db.rpc("limpar_ofertas_antigas", {"p_manter_dias": a.manter}).execute().data)
    print(f"limpeza: {apagadas} ofertas antigas apagadas da tabela do dia (mantidos {max(a.manter, 3)} dias)")


if __name__ == "__main__":
    main()
