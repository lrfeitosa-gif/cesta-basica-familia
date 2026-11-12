"""Leva as ofertas para o histórico por período e apaga da tabela do dia o que é antigo (migrações 0019 e 0020).

Se o produto, no mesmo mercado, tem o mesmo preço do dia anterior, o histórico não ganha linha nova:
o período só é esticado. Roda depois da coleta, todo dia.

O trabalho vai mercado por mercado: cada chamada da API tem limite de 8 s no Supabase, e um dia inteiro
de uma vez passava disso (12/11/2026).

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
    mercados = [m["id"] for m in tentar(lambda: db.table("mercado").select("id").order("id").execute().data)]
    dias = tentar(lambda: db.rpc("dias_para_consolidar", {}).execute().data) or []
    for dia in dias:
        n = 0
        for mercado in mercados:
            n += tentar(lambda: db.rpc("consolidar_dia", {"p_dia": dia, "p_mercado": mercado}).execute().data) or 0
        tentar(lambda: db.rpc("marcar_consolidado", {"p_dia": dia}).execute())
        print(f"histórico {dia}: {n} linhas esticadas ou criadas", flush=True)
    if not dias:
        print("histórico: nada a consolidar")
    if a.so_consolidar:
        return
    apagadas = 0
    for mercado in mercados:
        apagadas += tentar(lambda: db.rpc("limpar_ofertas_antigas",
                                          {"p_manter_dias": a.manter, "p_mercado": mercado}).execute().data) or 0
    print(f"limpeza: {apagadas} ofertas antigas apagadas da tabela do dia (mantidos {max(a.manter, 3)} dias)")


if __name__ == "__main__":
    main()
